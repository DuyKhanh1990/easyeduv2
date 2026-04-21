import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Wallet, BookOpen, Banknote, ArrowRightLeft,
  Loader2, Receipt, User, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FeeWalletSummary {
  hocPhi: number;
  datCoc: number;
  total: number;
}

interface FeeWalletTransaction {
  stt: number;
  id: string;
  action: string;
  direction: "credit" | "debit";
  className: string;
  amount: number;
  invoiceCode: string;
  invoiceDescription: string;
  invoiceId: string | null;
  createdAt: string;
  createdBy: string;
  category: string;
}

interface FeeWalletData {
  summary: FeeWalletSummary;
  transactions: FeeWalletTransaction[];
}


function formatCurrency(amount: number) {
  return amount.toLocaleString("vi-VN") + " đ";
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const day   = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year  = d.getFullYear();
  const hour  = String(d.getHours()).padStart(2, "0");
  const min   = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hour}:${min}`;
}

interface SummaryCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  iconBg: string;
  valueColor: string;
  testId: string;
}

function SummaryCard({ icon, label, value, iconBg, valueColor, testId }: SummaryCardProps) {
  return (
    <div
      className="bg-card border border-border rounded-2xl px-5 py-4 flex items-center gap-4 shadow-sm"
      data-testid={testId}
    >
      <div className={cn("flex items-center justify-center w-11 h-11 rounded-full shrink-0", iconBg)}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground mb-0.5 truncate">{label}</p>
        <p className={cn("text-lg font-bold tabular-nums", valueColor)}>
          {formatCurrency(value)}
        </p>
      </div>
    </div>
  );
}

interface Props {
  studentId: string;
  open: boolean;
}

export function StudentFeeWalletTab({ studentId, open }: Props) {
  const { data, isLoading, isError } = useQuery<FeeWalletData>({
    queryKey: ["/api/students", studentId, "fee-wallet"],
    queryFn: async () => {
      const res = await fetch(`/api/students/${studentId}/fee-wallet`, { credentials: "include" });
      if (!res.ok) throw new Error("Lỗi tải ví học phí");
      return res.json();
    },
    enabled: !!studentId && open,
    staleTime: 0,
    refetchOnMount: true,
  });

  const summary = data?.summary ?? { hocPhi: 0, datCoc: 0, total: 0 };
  const transactions = data?.transactions ?? [];

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-3 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-bold text-foreground">Ví học phí</h2>
          </div>
          <Button
            size="sm"
            className="px-3 py-1 rounded-md border text-xs font-medium transition-all gap-2"
            data-testid="btn-chuyen-tien"
            disabled
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
            Chuyển tiền
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-4">
          <SummaryCard
            icon={<Banknote className="h-5 w-5 text-blue-600" />}
            label="Tổng tiền"
            value={summary.total}
            iconBg="bg-blue-100 dark:bg-blue-900/30"
            valueColor="text-blue-700 dark:text-blue-400"
            testId="wallet-total"
          />
          <SummaryCard
            icon={<BookOpen className="h-5 w-5 text-green-600" />}
            label="Học phí"
            value={summary.hocPhi}
            iconBg="bg-green-100 dark:bg-green-900/30"
            valueColor="text-green-700 dark:text-green-400"
            testId="wallet-hocphi"
          />
          <SummaryCard
            icon={<Receipt className="h-5 w-5 text-violet-600" />}
            label="Đặt cọc"
            value={summary.datCoc}
            iconBg="bg-violet-100 dark:bg-violet-900/30"
            valueColor="text-violet-700 dark:text-violet-400"
            testId="wallet-datcoc"
          />
        </div>

        {/* Transaction Table */}
        <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <p className="font-semibold text-foreground text-sm">Lịch sử giao dịch</p>
            {transactions.length > 0 && (
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                {transactions.length} giao dịch
              </span>
            )}
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Đang tải...</span>
            </div>
          )}

          {isError && (
            <div className="text-center py-14 text-sm text-red-500">
              Không thể tải lịch sử giao dịch. Vui lòng thử lại.
            </div>
          )}

          {!isLoading && !isError && transactions.length === 0 && (
            <div className="flex flex-col items-center justify-center py-14 gap-3 text-muted-foreground">
              <Wallet className="h-10 w-10 opacity-20" />
              <p className="text-sm">Chưa có giao dịch nào</p>
            </div>
          )}

          {!isLoading && !isError && transactions.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 text-muted-foreground text-xs">
                    <th className="px-4 py-3 text-center font-medium w-12">STT</th>
                    <th className="px-4 py-3 text-left font-medium">Mô tả</th>
                    <th className="px-4 py-3 text-left font-medium">Lớp học</th>
                    <th className="px-4 py-3 text-right font-medium">Số tiền</th>
                    <th className="px-4 py-3 text-left font-medium">Hoá đơn</th>
                    <th className="px-4 py-3 text-left font-medium">Thời gian</th>
                    <th className="px-4 py-3 text-left font-medium">Người thực hiện</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {transactions.map((tx) => {
                    const isCredit = tx.direction === "credit";
                    const absAmount = Math.abs(tx.amount);
                    return (
                      <tr
                        key={tx.id}
                        className="hover:bg-muted/30 transition-colors"
                        data-testid={`wallet-tx-${tx.id}`}
                      >
                        <td className="px-4 py-3 text-center text-muted-foreground tabular-nums text-xs">{tx.stt}</td>
                        <td className="px-4 py-3">
                          <div className={cn("font-medium leading-snug text-sm", isCredit ? "text-green-600" : "text-red-500")}>
                            {tx.action}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">{tx.category}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{tx.className}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-sm">
                          <span className={isCredit ? "text-green-600" : "text-red-500"}>
                            {isCredit ? "+" : "−"}{formatCurrency(absAmount)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <span className="font-mono text-xs font-semibold text-foreground">{tx.invoiceCode}</span>
                            <span className="text-xs text-muted-foreground leading-snug line-clamp-2 max-w-[200px]">
                              {tx.invoiceDescription}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                          {formatDateTime(tx.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <User className="h-3.5 w-3.5 shrink-0" />
                            <span className="text-xs truncate max-w-[120px]">{tx.createdBy}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
