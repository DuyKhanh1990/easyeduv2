import { useQuery } from "@tanstack/react-query";
import { PackageOpen, Loader2, TrendingUp } from "lucide-react";
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
  const { data, isLoading, isError } = useQuery<{ packages: FeePackageRow[] }>({
    queryKey: ["/api/students", studentId, "fee-packages"],
    queryFn: async () => {
      const res = await fetch(`/api/students/${studentId}/fee-packages`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Lỗi tải gói học phí");
      return res.json();
    },
    enabled: !!studentId && open,
    staleTime: 0,
    refetchOnMount: true,
  });

  const packages = data?.packages ?? [];

  // Summary totals
  const totalRegistered = packages.reduce((s, p) => s + p.totalSessions, 0);
  const totalScheduled  = packages.reduce((s, p) => s + p.scheduledSessions, 0);
  const totalAttended   = packages.reduce((s, p) => s + (p.attendedSessions ?? 0), 0);
  const totalRemaining  = packages.reduce((s, p) => s + p.remainingSessions, 0);
  const overallRatio    = totalRegistered > 0 ? totalScheduled / totalRegistered : 0;

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">

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
          <div className="px-6 py-4 border-b bg-muted/30 grid grid-cols-5 gap-4">
            {[
              { label: "Tổng đăng ký", value: totalRegistered, unit: "buổi", color: "text-foreground" },
              { label: "Đã xếp", value: totalScheduled, unit: "buổi", color: "text-blue-600" },
              { label: "Đã học", value: totalAttended, unit: "buổi", color: "text-purple-600" },
              { label: "Còn lại", value: totalRemaining, unit: "buổi", color: "text-orange-500" },
              { label: "Tỷ lệ tổng", value: `${Math.round(overallRatio * 100)}%`, unit: "", color: totalRemaining === 0 ? "text-green-600" : "text-foreground" },
            ].map((item) => (
              <div key={item.label} className="text-center">
                <p className="text-xs text-muted-foreground mb-0.5">{item.label}</p>
                <p className={cn("text-xl font-bold tabular-nums", item.color)}>
                  {item.value}
                  {item.unit && <span className="text-xs font-normal text-muted-foreground ml-1">{item.unit}</span>}
                </p>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="px-6 py-4">
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead>
                <tr>
                  {["Tên gói", "Tổng đăng ký (buổi)", "Đã xếp (buổi)", "Đã học (buổi)", "Còn lại (buổi)", "Tỷ lệ"].map((h) => (
                    <th
                      key={h}
                      className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide py-2.5 px-3 border-b border-border bg-muted/20 first:rounded-tl-lg last:rounded-tr-lg"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {packages.map((pkg, idx) => {
                  const isLast = idx === packages.length - 1;
                  const attended = pkg.attendedSessions ?? 0;
                  const remainColor =
                    pkg.remainingSessions === 0 ? "text-green-600 font-semibold" :
                    pkg.remainingSessions <= 2 ? "text-red-500 font-semibold" :
                    "text-foreground";

                  return (
                    <tr
                      key={pkg.packageId}
                      className="group hover:bg-muted/30 transition-colors"
                      data-testid={`fee-package-row-${pkg.packageId}`}
                    >
                      <td className={cn(
                        "py-3 px-3 border-b font-medium text-foreground",
                        isLast && "border-b-0"
                      )}>
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-3.5 w-3.5 text-primary/60 shrink-0" />
                          {pkg.name}
                        </div>
                      </td>
                      <td className={cn(
                        "py-3 px-3 border-b tabular-nums text-center font-medium",
                        isLast && "border-b-0"
                      )}>
                        {pkg.totalSessions}
                      </td>
                      <td className={cn(
                        "py-3 px-3 border-b tabular-nums text-center text-blue-600 font-medium",
                        isLast && "border-b-0"
                      )}>
                        {pkg.scheduledSessions}
                      </td>
                      <td className={cn(
                        "py-3 px-3 border-b tabular-nums text-center text-purple-600 font-medium",
                        isLast && "border-b-0"
                      )}>
                        {attended}
                      </td>
                      <td className={cn(
                        "py-3 px-3 border-b tabular-nums text-center",
                        remainColor,
                        isLast && "border-b-0"
                      )}>
                        {pkg.remainingSessions}
                      </td>
                      <td className={cn(
                        "py-3 px-3 border-b",
                        isLast && "border-b-0"
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
      )}
    </div>
  );
}
