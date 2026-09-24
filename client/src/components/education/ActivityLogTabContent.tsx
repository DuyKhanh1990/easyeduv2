import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Eye, BookOpen, ChevronLeft, ChevronRight } from "lucide-react";
import {
  ActivityLog,
  getActionColor,
  formatDate,
  buildActionSummary,
  LogDetailDialog,
} from "@/components/education/ClassActivityLogDialog";

interface ActivityLogTabContentProps {
  classId: string;
}

export function ActivityLogTabContent({ classId }: ActivityLogTabContentProps) {
  const [search, setSearch] = useState("");
  const [detailLog, setDetailLog] = useState<ActivityLog | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const { data: logs = [], isLoading } = useQuery<ActivityLog[]>({
    queryKey: ["/api/activity-logs", classId],
    queryFn: async () => {
      const res = await fetch(`/api/activity-logs?classId=${classId}&limit=500`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Không tải được nhật ký");
      return res.json();
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 10000,
  });

  const filtered = logs.filter((log) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (log.userName ?? "").toLowerCase().includes(q) ||
      (log.locationName ?? "").toLowerCase().includes(q) ||
      log.action.toLowerCase().includes(q) ||
      (log.oldContent ?? "").toLowerCase().includes(q) ||
      (log.newContent ?? "").toLowerCase().includes(q) ||
      (log.className ?? "").toLowerCase().includes(q) ||
      (log.classCode ?? "").toLowerCase().includes(q)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleSearchChange = (v: string) => {
    setSearch(v);
    setPage(1);
  };

  const handlePageSizeChange = (v: string) => {
    setPageSize(Number(v));
    setPage(1);
  };

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden rounded-xl border border-border bg-card shadow-sm">

        {/* Fixed header */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Nhật ký hành động</span>
            {filtered.length > 0 && (
              <Badge variant="secondary" className="text-xs">{filtered.length}</Badge>
            )}
          </div>
          <div className="relative w-60">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Tìm kiếm..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
        </div>

        {/* Scrollable table */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Đang tải nhật ký...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              {search ? "Không tìm thấy kết quả phù hợp." : "Chưa có nhật ký nào."}
            </div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-secondary/50 z-10">
                <TableRow className="text-xs">
                  <TableHead className="w-[50px] py-2 text-center">#</TableHead>
                  <TableHead className="w-[160px] py-2">Người dùng</TableHead>
                  <TableHead className="w-[140px] py-2 whitespace-nowrap">Thời gian</TableHead>
                  <TableHead className="w-[150px] py-2">Hành động</TableHead>
                  <TableHead className="py-2">Mô tả</TableHead>
                  <TableHead className="w-[60px] py-2 text-center">Chi tiết</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map((log, idx) => (
                  <TableRow key={log.id} className="text-xs">
                    <TableCell className="py-2 text-center text-muted-foreground">
                      {(safePage - 1) * pageSize + idx + 1}
                    </TableCell>
                    <TableCell className="py-2 font-medium">
                      {log.userName ?? (
                        <span className="text-muted-foreground italic">—</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2 text-muted-foreground whitespace-nowrap">
                      {formatDate(log.createdAt)}
                    </TableCell>
                    <TableCell className="py-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-medium ${getActionColor(log.action)}`}
                      >
                        {log.action}
                      </span>
                    </TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground">
                      {buildActionSummary(log)}
                    </TableCell>
                    <TableCell className="py-2 text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-primary"
                        onClick={() => setDetailLog(log)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Fixed footer pagination */}
        <div className="shrink-0 flex items-center justify-between gap-4 px-4 py-2.5 border-t border-border bg-background">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Hiển thị</span>
            <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
              <SelectTrigger className="h-7 w-[70px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="200">200</SelectItem>
              </SelectContent>
            </Select>
            <span>/ trang</span>
          </div>

          <div className="text-xs text-muted-foreground">
            {filtered.length > 0
              ? `${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, filtered.length)} / ${filtered.length}`
              : "0 kết quả"}
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs text-muted-foreground min-w-[60px] text-center">
              Trang {safePage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {detailLog && (
        <LogDetailDialog
          log={detailLog}
          open={!!detailLog}
          onOpenChange={(v) => { if (!v) setDetailLog(null); }}
        />
      )}
    </>
  );
}
