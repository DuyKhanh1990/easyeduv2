import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, isSameDay } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ChevronRight, Search, CalendarDays } from "lucide-react";

function formatVND(amount: number): string {
  return Math.round(amount).toLocaleString("vi-VN");
}

interface InvoiceSummary {
  studentId: string;
  grandTotal: number;
  paidAmount: number;
  remainingAmount: number;
  count: number;
  status: string;
}

interface ActiveTabContentProps {
  classId: string;
  activeStudents: any[] | undefined;
}

export function ActiveTabContent({ classId, activeStudents }: ActiveTabContentProps) {
  const [selectedActiveStudent, setSelectedActiveStudent] = useState<any>(null);
  const [listSearch, setListSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data: studentSessions } = useQuery<any[]>({
    queryKey: [`/api/classes/${classId}/student/${selectedActiveStudent?.id}/sessions`],
    enabled: !!selectedActiveStudent,
  });

  const { data: invoiceSummaries = [] } = useQuery<InvoiceSummary[]>({
    queryKey: [`/api/classes/${classId}/invoice-summary`],
    enabled: !!classId,
    refetchOnMount: "always",
  });

  const invoiceMap = Object.fromEntries(invoiceSummaries.map((inv) => [inv.studentId, inv]));

  const filteredActive = (activeStudents || []).filter((s: any) => {
    if (!listSearch.trim()) return true;
    const q = listSearch.toLowerCase();
    return (
      s.student?.fullName?.toLowerCase().includes(q) ||
      s.student?.code?.toLowerCase().includes(q)
    );
  });
  const totalPages = Math.max(1, Math.ceil(filteredActive.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedActive = filteredActive.slice((safePage - 1) * pageSize, safePage * pageSize);

  const attendanceLabels: Record<string, string> = {
    pending: "Chưa điểm danh",
    present: "Có học",
    absent: "Nghỉ học",
    makeup_wait: "Nghỉ chờ bù",
    makeup_done: "Đã học bù",
    paused: "Bảo lưu",
  };

  return (
    <>
      {/* Search bar */}
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Tìm theo tên / mã học viên..."
          className="pl-8 h-9 text-sm"
          value={listSearch}
          onChange={(e) => { setListSearch(e.target.value); setPage(1); }}
          data-testid="input-active-search"
        />
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên</TableHead>
              <TableHead>Bắt đầu</TableHead>
              <TableHead>Kết thúc</TableHead>
              <TableHead>Số buổi</TableHead>
              <TableHead>Đã học</TableHead>
              <TableHead>Còn lại</TableHead>
              <TableHead>Hoá đơn</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead>Lịch học</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedActive.map((s) => (
              <TableRow
                key={s.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => setSelectedActiveStudent(s.student)}
              >
                <TableCell className="font-medium">{s.student?.fullName}</TableCell>
                <TableCell>
                  {s.startDate ? format(new Date(s.startDate), "dd/MM/yyyy") : "-"}
                </TableCell>
                <TableCell>
                  {s.endDate ? format(new Date(s.endDate), "dd/MM/yyyy") : "-"}
                </TableCell>
                <TableCell>{s.totalSessions || 0}</TableCell>
                <TableCell>{s.attendedSessions || 0}</TableCell>
                <TableCell>{s.remainingSessions ?? ((s.totalSessions || 0) - (s.attendedSessions || 0))}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {(() => {
                    const inv = invoiceMap[s.student?.id ?? s.id];
                    if (!inv) {
                      return <span className="text-muted-foreground text-xs italic">Chưa có</span>;
                    }
                    const pct = inv.grandTotal > 0 ? Math.round((inv.paidAmount / inv.grandTotal) * 100) : 0;
                    const pctColor =
                      pct >= 100 ? "text-green-700 font-semibold" :
                      pct > 0    ? "text-yellow-700 font-semibold" :
                                   "text-red-600 font-semibold";
                    return (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-medium">
                          {formatVND(inv.paidAmount)} / {formatVND(inv.grandTotal)}
                        </span>
                        <span className={`text-[11px] ${pctColor}`}>{pct}% đã thanh toán</span>
                      </div>
                    );
                  })()}
                </TableCell>
                <TableCell>
                  {(() => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const start = s.startDate ? new Date(s.startDate) : null;
                    const end = s.endDate ? new Date(s.endDate) : null;
                    if (!start && !end)
                      return (
                        <Badge
                          variant="outline"
                          className="bg-gray-100 text-gray-600 border-gray-200"
                        >
                          waiting
                        </Badge>
                      );
                    if (start && today < start)
                      return (
                        <Badge
                          variant="outline"
                          className="bg-purple-100 text-purple-700 border-purple-200"
                        >
                          Chờ đến lịch
                        </Badge>
                      );
                    if (end && today > end)
                      return (
                        <Badge
                          variant="outline"
                          className="bg-red-100 text-red-700 border-red-200"
                        >
                          Đã kết thúc
                        </Badge>
                      );
                    return (
                      <Badge
                        variant="outline"
                        className="bg-green-100 text-green-700 border-green-200"
                      >
                        Đang học
                      </Badge>
                    );
                  })()}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                    title="Chi tiết học tập"
                    data-testid={`btn-student-schedule-${s.id}`}
                    onClick={() => setSelectedActiveStudent(s.student)}
                  >
                    <CalendarDays className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filteredActive.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  {listSearch ? "Không tìm thấy học viên phù hợp" : "Không có học viên chính thức nào"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {filteredActive.length > 0 && (
        <div className="flex items-center justify-between mt-3 text-sm text-muted-foreground">
          <span>
            {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filteredActive.length)} / {filteredActive.length} học viên
          </span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs">Hiển thị:</span>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                className="border rounded px-1.5 py-0.5 text-xs bg-background"
                data-testid="select-active-page-size"
              >
                <option value={20}>20</option>
                <option value={30}>30</option>
                <option value={50}>50</option>
              </select>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>‹</Button>
              <span className="px-1">{safePage} / {totalPages}</span>
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>›</Button>
            </div>
          </div>
        </div>
      )}

      <Drawer
        open={!!selectedActiveStudent}
        onOpenChange={(open) => !open && setSelectedActiveStudent(null)}
      >
        <DrawerContent>
          <div className="mx-auto w-full max-w-[1400px] px-4">
            <DrawerHeader>
              <DrawerTitle>Chi tiết học tập: {selectedActiveStudent?.fullName}</DrawerTitle>
            </DrawerHeader>
            <div className="p-4 mb-8">
              <ScrollArea className="h-[60vh]">
                <div className="grid grid-cols-10 gap-3">
                  {studentSessions?.map((session, index) => {
                    const date = new Date(session.classSession?.sessionDate);
                    const isPast = date < new Date() && !isSameDay(date, new Date());
                    const isToday = isSameDay(date, new Date());

                    let statusColor =
                      "bg-muted/30 text-muted-foreground/60 border-muted/10";
                    if (
                      session.attendanceStatus === "present" ||
                      session.attendanceStatus === "makeup_done"
                    ) {
                      statusColor = "bg-blue-50 text-blue-600 border-blue-100";
                    } else if (isPast) {
                      statusColor = "bg-muted/30 text-muted-foreground/60 border-muted/10";
                    } else if (isToday || date > new Date()) {
                      statusColor = "bg-blue-50/50 text-blue-500 border-blue-100/50";
                    }

                    return (
                      <div
                        key={session.id}
                        className={`flex flex-col items-center gap-1 border rounded-lg p-3 text-center ${statusColor}`}
                      >
                        <span className="text-[10px] font-semibold opacity-70 uppercase text-foreground">
                          Buổi {index + 1}
                        </span>
                        <span className="text-sm font-bold text-foreground">
                          {format(date, "dd/MM")}
                        </span>
                        <div className="flex flex-col items-center text-[10px] opacity-70 text-foreground">
                          <span>
                            {(() => {
                              const day = date.getDay();
                              return day === 0 ? "Chủ Nhật" : `Thứ ${day + 1}`;
                            })()}
                          </span>
                          <span className="mt-0.5 whitespace-nowrap">
                            {session.classSession?.shiftTemplate?.startTime} -{" "}
                            {session.classSession?.shiftTemplate?.endTime}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-col items-center gap-1">
                          <span
                            className={`text-[10px] font-medium ${
                              session.attendanceStatus === "present"
                                ? "text-green-600"
                                : session.attendanceStatus === "absent"
                                ? "text-red-600"
                                : session.attendanceStatus === "makeup_wait"
                                ? "text-orange-600"
                                : session.attendanceStatus === "makeup_done"
                                ? "text-blue-600"
                                : session.attendanceStatus === "paused"
                                ? "text-yellow-600"
                                : "text-foreground/70"
                            }`}
                          >
                            {attendanceLabels[session.attendanceStatus] ||
                              session.attendanceStatus}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
