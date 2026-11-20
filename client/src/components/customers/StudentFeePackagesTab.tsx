import { useQuery } from "@tanstack/react-query";
import { PackageOpen, Loader2, TrendingUp, AlertTriangle, RefreshCw, BookOpen, CalendarCheck, Timer } from "lucide-react";
import { cn } from "@/lib/utils";

interface FeePackageRow {
  packageId: string;
  name: string;
  totalSessions: number;
  scheduledSessions: number;
  attendedSessions: number;
  remainingSessions: number;
  ratio: number;
}

function RatioBar({ ratio }: { ratio: number }) {
  const pct = Math.round(ratio * 100);
  const color =
    pct >= 90 ? "bg-red-500" :
    pct >= 70 ? "bg-orange-400" :
    pct >= 40 ? "bg-blue-500" :
    "bg-green-500";

  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <span className={cn(
        "text-xs font-semibold tabular-nums w-9 text-right",
        pct >= 90 ? "text-red-500" :
        pct >= 70 ? "text-orange-500" :
        pct >= 40 ? "text-blue-600" :
        "text-green-600"
      )}>
        {pct}%
      </span>
    </div>
  );
}

interface Props {
  studentId: string;
  open: boolean;
}

export function StudentFeePackagesTab({ studentId, open }: Props) {
  const { data, isLoading, isError, isFetching, refetch } = useQuery<{ packages: FeePackageRow[] }>({
    queryKey: ["/api/students", studentId, "fee-packages"],
    queryFn: async () => {
      const res = await fetch(`/api/students/${studentId}/fee-packages`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Lỗi tải gói học phí");
      return res.json();
    },
    enabled: !!studentId && open,
    staleTime: 30_000,
  });

  const packages = data?.packages ?? [];

  // Summary totals
  const totalRegistered = packages.reduce((s, p) => s + p.totalSessions, 0);
  const totalScheduled  = packages.reduce((s, p) => s + p.scheduledSessions, 0);
  const totalRemaining  = packages.reduce((s, p) => s + p.remainingSessions, 0);
  const overallRatio    = totalRegistered > 0 ? totalScheduled / totalRegistered : 0;

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">

      {/* ── Toolbar ─────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0">
        <div className="flex items-center gap-2">
          <PackageOpen className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Gói học phí</span>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          title="Làm mới dữ liệu"
        >
          <RefreshCw className={cn("h-3 w-3", isFetching && "animate-spin")} />
          Làm mới
        </button>
      </div>

      {/* ── Loading ─────────────────────────────────────── */}
      {isLoading && (
        <div className="flex-1 flex items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Đang tải gói học phí...</span>
        </div>
      )}

      {/* ── Error ───────────────────────────────────────── */}
      {isError && (
        <div className="flex-1 flex items-center justify-center text-sm text-red-500">
          Không thể tải dữ liệu. Vui lòng thử lại.
        </div>
      )}

      {/* ── Empty ───────────────────────────────────────── */}
      {!isLoading && !isError && packages.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <PackageOpen className="h-10 w-10 opacity-20" />
          <p className="text-sm">Học viên chưa có gói học phí nào</p>
        </div>
      )}

      {/* ── Content ─────────────────────────────────────── */}
      {!isLoading && !isError && packages.length > 0 && (
        <div className="flex-1 overflow-y-auto">

          {/* Summary strip */}
          <div className="px-5 py-4 border-b bg-slate-50 grid grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                <BookOpen className="h-4 w-4 text-indigo-600" />
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Tổng đăng ký</p>
                <p className="text-lg font-bold text-gray-800 tabular-nums leading-tight">{totalRegistered} <span className="text-xs font-normal text-gray-400">buổi</span></p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                <CalendarCheck className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Đã xếp</p>
                <p className="text-lg font-bold text-blue-600 tabular-nums leading-tight">{totalScheduled} <span className="text-xs font-normal text-gray-400">buổi</span></p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
                <Timer className="h-4 w-4 text-orange-500" />
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Còn lại</p>
                <p className="text-lg font-bold text-orange-500 tabular-nums leading-tight">{totalRemaining} <span className="text-xs font-normal text-gray-400">buổi</span></p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 flex items-center gap-3">
              <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", totalRemaining === 0 ? "bg-green-50" : "bg-gray-50")}>
                <TrendingUp className={cn("h-4 w-4", totalRemaining === 0 ? "text-green-600" : "text-gray-400")} />
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Tỷ lệ tổng</p>
                <p className={cn("text-lg font-bold tabular-nums leading-tight", totalRemaining === 0 ? "text-green-600" : "text-gray-800")}>{Math.round(overallRatio * 100)}%</p>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="px-5 py-4">
            <div className="rounded-xl border border-gray-100 overflow-hidden shadow-sm bg-white">
              <table className="w-full text-sm border-separate border-spacing-0">
                <thead>
                  <tr className="bg-slate-50">
                    {["Tên gói", "Tổng đăng ký (buổi)", "Đã xếp (buổi)", "Còn lại (buổi)", "Tỷ lệ"].map((h) => (
                      <th
                        key={h}
                        className="text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider py-2.5 px-4 border-b border-gray-100"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {packages.map((pkg, idx) => {
                    const isLast = idx === packages.length - 1;
                    const isOverScheduled = pkg.scheduledSessions > pkg.totalSessions;
                    const remainColor =
                      pkg.remainingSessions === 0 ? "text-green-600 font-semibold" :
                      pkg.remainingSessions <= 2 ? "text-red-500 font-semibold" :
                      "text-gray-700";

                    return (
                      <tr
                        key={pkg.packageId}
                        className="group hover:bg-indigo-50/40 transition-colors"
                        data-testid={`fee-package-row-${pkg.packageId}`}
                      >
                        <td className={cn(
                          "py-3 px-4 font-medium text-gray-800",
                          !isLast && "border-b border-gray-50"
                        )}>
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                              <TrendingUp className="h-3.5 w-3.5 text-indigo-600" />
                            </div>
                            <span>{pkg.name}</span>
                          </div>
                          {isOverScheduled && (
                            <div className="flex items-center gap-1 mt-1.5 ml-9 text-amber-600">
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              <span className="text-xs font-normal">Xếp lịch nhiều hơn số buổi đăng ký</span>
                            </div>
                          )}
                        </td>
                        <td className={cn(
                          "py-3 px-4 tabular-nums text-center font-semibold text-gray-700",
                          !isLast && "border-b border-gray-50"
                        )}>
                          {pkg.totalSessions}
                        </td>
                        <td className={cn(
                          "py-3 px-4 tabular-nums text-center font-semibold",
                          isOverScheduled ? "text-amber-600" : "text-blue-600",
                          !isLast && "border-b border-gray-50"
                        )}>
                          {pkg.scheduledSessions}
                          {isOverScheduled && <span className="ml-1 text-amber-500">⚠</span>}
                        </td>
                        <td className={cn(
                          "py-3 px-4 tabular-nums text-center",
                          remainColor,
                          !isLast && "border-b border-gray-50"
                        )}>
                          {pkg.remainingSessions}
                        </td>
                        <td className={cn(
                          "py-3 px-4",
                          !isLast && "border-b border-gray-50"
                        )}>
                          <RatioBar ratio={pkg.ratio} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
