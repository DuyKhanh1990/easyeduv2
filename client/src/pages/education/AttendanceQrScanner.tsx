import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Html5Qrcode } from "html5-qrcode";
import { AlertCircle, Camera, CheckCircle2, Loader2, QrCode, RotateCcw } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";

type ScanData = {
  student: { id: string; code: string; fullName: string };
  session: {
    studentSessionId: string;
    classSessionId: string;
    className: string;
    classCode: string;
    sessionDate: string;
    sessionIndex: number | null;
    startTime: string;
    endTime: string;
    teacherName: string;
    attendanceStatus: string;
  };
  attendance: {
    canAttend: boolean;
    openAt: string;
    latestAt: string;
  };
};

function extractToken(value: string): string {
  const raw = value.trim();
  try {
    const url = new URL(raw, window.location.origin);
    const token = url.searchParams.get("token");
    if (token) return token;
  } catch {
    // Raw token fallback below.
  }
  return raw;
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AttendanceQrScanner() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [token, setToken] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("token") || "";
  });
  const [manualValue, setManualValue] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [marked, setMarked] = useState(false);

  const scanQuery = useQuery<ScanData>({
    queryKey: ["/api/attendance-qr/scan", token],
    queryFn: () => apiRequest("GET", `/api/attendance-qr/scan/${encodeURIComponent(token)}`).then((res) => res.json()),
    enabled: !!token,
    retry: false,
  });

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;
    try {
      if (scanner.isScanning) await scanner.stop();
      scanner.clear();
    } catch {
      // The camera may already have been stopped after a successful scan.
    }
  }, []);

  const handleDecoded = useCallback((decoded: string) => {
    const nextToken = extractToken(decoded);
    if (!nextToken) return;
    setToken(nextToken);
    setMarked(false);
    void stopScanner();
  }, [stopScanner]);

  useEffect(() => {
    if (token) {
      void stopScanner();
      return;
    }

    let cancelled = false;
    const scanner = new Html5Qrcode("attendance-qr-reader");
    scannerRef.current = scanner;
    setCameraError("");
    scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 260, height: 260 } },
      (decoded) => {
        if (!cancelled) handleDecoded(decoded);
      },
      () => undefined,
    ).catch((error: any) => {
      if (!cancelled) {
        setCameraError(error?.message || "Không thể mở camera. Hãy cấp quyền camera hoặc nhập mã thủ công.");
      }
    });

    return () => {
      cancelled = true;
      void stopScanner();
    };
  }, [token, handleDecoded, stopScanner]);

  const attendanceMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/student-sessions/attendance", {
        student_session_id: scanQuery.data?.session.studentSessionId,
        attendance_status: "present",
        attendance_note: "Điểm danh QR",
      }).then((res) => res.json()),
    onSuccess: () => {
      setMarked(true);
      queryClient.invalidateQueries({ queryKey: ["/api/attendance-qr/scan", token] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance"] });
    },
  });

  const resetScanner = () => {
    setToken("");
    setManualValue("");
    setMarked(false);
    setCameraError("");
    queryClient.removeQueries({ queryKey: ["/api/attendance-qr/scan"] });
  };

  const session = scanQuery.data?.session;
  const canAttend = !!scanQuery.data?.attendance.canAttend && session?.attendanceStatus !== "present" && !marked;
  const scanError = scanQuery.isError ? (scanQuery.error as Error)?.message || "Không thể đọc mã QR." : "";

  return (
    <DashboardLayout>
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-5 p-4 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
              <QrCode className="h-6 w-6 text-indigo-600" />
              Quét QR điểm danh
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Quét mã QR trong hồ sơ học viên để xem đúng lịch phù hợp.
            </p>
          </div>
          {token && (
            <Button variant="outline" size="sm" onClick={resetScanner}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Quét mã khác
            </Button>
          )}
        </div>

        {!token && (
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div id="attendance-qr-reader" className="mx-auto min-h-[300px] w-full max-w-md overflow-hidden rounded-xl bg-slate-950" />
            {cameraError && (
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {cameraError}
              </p>
            )}
            <div className="mx-auto mt-4 flex max-w-md gap-2">
              <Input
                value={manualValue}
                onChange={(event) => setManualValue(event.target.value)}
                placeholder="Hoặc dán nội dung mã QR"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && manualValue.trim()) handleDecoded(manualValue);
                }}
              />
              <Button onClick={() => handleDecoded(manualValue)} disabled={!manualValue.trim()}>
                Mở mã
              </Button>
            </div>
          </div>
        )}

        {token && scanQuery.isLoading && (
          <div className="flex min-h-64 items-center justify-center rounded-2xl border bg-white text-muted-foreground shadow-sm">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Đang kiểm tra lịch học...
          </div>
        )}

        {token && scanError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700 shadow-sm">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">Không thể điểm danh</p>
                <p className="mt-1 text-sm">{scanError}</p>
              </div>
            </div>
          </div>
        )}

        {token && session && scanQuery.data && (
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3 border-b pb-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Học viên</p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">{scanQuery.data.student.fullName}</h2>
                <p className="text-sm text-slate-500">{scanQuery.data.student.code}</p>
              </div>
              {session.attendanceStatus === "present" || marked ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  Đã điểm danh
                </span>
              ) : null}
            </div>

            <div className="mt-5 rounded-xl bg-indigo-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-indigo-600">Lịch học</p>
                  <h3 className="mt-1 text-lg font-bold text-indigo-950">{session.className || session.classCode}</h3>
                  <p className="text-sm text-indigo-800">{session.startTime} - {session.endTime}</p>
                </div>
                {session.sessionIndex ? (
                  <span className="rounded-full bg-white/70 px-2.5 py-1 text-xs font-medium text-indigo-700">
                    Buổi {session.sessionIndex}
                  </span>
                ) : null}
              </div>
              {session.teacherName && (
                <p className="mt-3 text-sm text-indigo-800">Giáo viên: {session.teacherName}</p>
              )}
            </div>

            <div className="mt-5 flex flex-col items-stretch gap-3">
              <Button
                size="lg"
                className="w-full"
                disabled={!canAttend || attendanceMutation.isPending}
                onClick={() => attendanceMutation.mutate()}
              >
                {attendanceMutation.isPending ? "Đang điểm danh..." : "Điểm danh"}
              </Button>
              {!canAttend && session.attendanceStatus !== "present" && !marked && (
                <p className="text-center text-sm font-semibold text-red-600">
                  Điểm danh mở lúc {formatTime(scanQuery.data.attendance.openAt)}
                </p>
              )}
              {session.attendanceStatus === "present" || marked ? (
                <p className="text-center text-sm text-emerald-700">Học viên đã được ghi nhận Có học.</p>
              ) : null}
              {attendanceMutation.isError && (
                <p className="text-center text-sm text-red-600">
                  {(attendanceMutation.error as Error)?.message || "Không thể điểm danh."}
                </p>
              )}
            </div>
          </div>
        )}

        {!token && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Camera className="h-4 w-4" />
            Hướng camera vào mã QR của học viên
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}