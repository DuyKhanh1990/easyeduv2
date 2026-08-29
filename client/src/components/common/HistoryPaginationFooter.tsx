import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface HistoryPaginationFooterProps {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  isLoading?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  legend?: ReactNode;
}

export function HistoryPaginationFooter({
  total,
  page,
  pageSize,
  totalPages,
  isLoading = false,
  onPageChange,
  onPageSizeChange,
  legend,
}: HistoryPaginationFooterProps) {
  const from = total > 0 ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(page * pageSize, total);
  const buttonClass = "h-7 w-7 rounded-lg bg-white";

  return (
    <div className="shrink-0 min-h-12 px-4 py-2 border rounded-xl bg-white flex items-center justify-between gap-3 flex-wrap text-xs text-slate-500">
      <div className="flex items-center gap-3 min-w-0">
        <span className="whitespace-nowrap">
          Tổng: <span className="font-semibold text-slate-700">{total.toLocaleString()}</span> bản ghi
        </span>
        <span className="text-slate-400 whitespace-nowrap">
          · Hiển thị {from}–{to}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap ml-auto">
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span>Số hàng:</span>
          <Select value={String(pageSize)} onValueChange={value => onPageSizeChange(Number(value))}>
            <SelectTrigger className="h-7 w-[76px] rounded-lg bg-white border-slate-200 text-[11px]" data-testid="select-history-page-size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
              <SelectItem value="200">200</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1 whitespace-nowrap">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={buttonClass}
            disabled={page <= 1 || isLoading}
            onClick={() => onPageChange(1)}
            aria-label="Trang đầu"
          >
            «
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={buttonClass}
            disabled={page <= 1 || isLoading}
            onClick={() => onPageChange(Math.max(1, page - 1))}
            aria-label="Trang trước"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="min-w-[42px] text-center">{page} / {totalPages}</span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={buttonClass}
            disabled={page >= totalPages || isLoading}
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            aria-label="Trang sau"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={buttonClass}
            disabled={page >= totalPages || isLoading}
            onClick={() => onPageChange(totalPages)}
            aria-label="Trang cuối"
          >
            »
          </Button>
        </div>

        {legend && <div className="flex items-center gap-2 text-[11px]">{legend}</div>}
      </div>
    </div>
  );
}