import { useState } from "react";
import { eachDayOfInterval, format, getDay, parseISO } from "date-fns";
import { vi } from "date-fns/locale";
import { X, DollarSign, Filter, Banknote } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const VIET_DAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

interface SalaryTableInfo {
  id?: string;
  name: string;
  startDate: string;
  endDate: string;
  locationId?: string;
  locationName?: string;
}

interface MockTeacherRow {
  id: number;
  code: string;
  schedule: string;
  subject: string;
  role: string;
  pkg: string;
  sessionDayIndices: number[];
  total: string;
  totalSalary: string;
  hasPkg: boolean;
}

const MOCK_ROWS: MockTeacherRow[] = [
  { id: 1, code: "GV-01", schedule: "A2", subject: "-", role: "Giáo viên", pkg: "Lương 200k/buổi", sessionDayIndices: [], total: "0 buổi", totalSalary: "0đ", hasPkg: true },
  { id: 2, code: "GV-01", schedule: "A3", subject: "-", role: "Giáo viên", pkg: "Lương 100k/h", sessionDayIndices: [2, 4], total: "2.0 giờ", totalSalary: "200.000đ", hasPkg: true },
  { id: 3, code: "GV-01", schedule: "A4", subject: "-", role: "Giáo viên", pkg: "Mốc 50h", sessionDayIndices: [3, 5], total: "2.0 giờ", totalSalary: "0đ", hasPkg: true },
  { id: 4, code: "GV-01", schedule: "A5", subject: "-", role: "Giáo viên", pkg: "Lương 200k/buổi", sessionDayIndices: [6], total: "1 buổi", totalSalary: "200.000đ", hasPkg: true },
  { id: 5, code: "GV-01", schedule: "A6", subject: "-", role: "Giáo viên", pkg: "Chưa gắn", sessionDayIndices: [1], total: "-", totalSalary: "-", hasPkg: false },
  { id: 6, code: "GV-01", schedule: "A7", subject: "-", role: "Giáo viên", pkg: "Chưa gắn", sessionDayIndices: [5, 7], total: "-", totalSalary: "-", hasPkg: false },
  { id: 7, code: "GV-01", schedule: "A8", subject: "-", role: "Giáo viên", pkg: "Chưa gắn", sessionDayIndices: [], total: "-", totalSalary: "-", hasPkg: false },
  { id: 8, code: "GV-01", schedule: "A9", subject: "-", role: "Giáo viên", pkg: "Chưa gắn", sessionDayIndices: [2, 8], total: "-", totalSalary: "-", hasPkg: false },
  { id: 9, code: "GV-01", schedule: "A10", subject: "-", role: "Giáo viên", pkg: "Chưa gắn", sessionDayIndices: [], total: "-", totalSalary: "-", hasPkg: false },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salaryTable: SalaryTableInfo | null;
}

export function TeacherSalarySheetDialog({ open, onOpenChange, salaryTable }: Props) {
  const [filterLocation, setFilterLocation] = useState("all");
  const [filterTeacher, setFilterTeacher] = useState("all");
  const [filterSubject, setFilterSubject] = useState("all");
  const [filterPackage, setFilterPackage] = useState("all");
  const [selectedRows, setSelectedRows] = useState<number[]>([]);

  if (!salaryTable) return null;

  let dates: Date[] = [];
  try {
    dates = eachDayOfInterval({
      start: parseISO(salaryTable.startDate),
      end: parseISO(salaryTable.endDate),
    });
  } catch {
    dates = [];
  }

  const toggleRow = (id: number) => {
    setSelectedRows((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (selectedRows.length === MOCK_ROWS.length) {
      setSelectedRows([]);
    } else {
      setSelectedRows(MOCK_ROWS.map((r) => r.id));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[98vw] w-full max-h-[95vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-orange-500 shrink-0" />
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold leading-tight">
                {salaryTable.name || "Bảng lương"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {salaryTable.locationName && (
                  <span className="mr-2">{salaryTable.locationName}</span>
                )}
                {salaryTable.startDate && salaryTable.endDate && (
                  <span>
                    {format(parseISO(salaryTable.startDate), "dd/MM/yyyy")} —{" "}
                    {format(parseISO(salaryTable.endDate), "dd/MM/yyyy")}
                  </span>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Filter bar */}
        <div className="px-5 py-3 border-b shrink-0 bg-muted/30">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
            <Select value={filterLocation} onValueChange={setFilterLocation}>
              <SelectTrigger className="h-8 w-40 text-xs" data-testid="filter-location">
                <SelectValue placeholder="Cơ sở" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả cơ sở</SelectItem>
                <SelectItem value="main">Cơ sở chính</SelectItem>
                <SelectItem value="mk">Minh Khai</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterTeacher} onValueChange={setFilterTeacher}>
              <SelectTrigger className="h-8 w-44 text-xs" data-testid="filter-teacher">
                <SelectValue placeholder="Giáo viên" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả giáo viên</SelectItem>
                <SelectItem value="gv01">GV-01</SelectItem>
                <SelectItem value="gv02">GV-02</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterSubject} onValueChange={setFilterSubject}>
              <SelectTrigger className="h-8 w-40 text-xs" data-testid="filter-subject">
                <SelectValue placeholder="Bộ môn" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả bộ môn</SelectItem>
                <SelectItem value="toan">Toán</SelectItem>
                <SelectItem value="van">Văn</SelectItem>
                <SelectItem value="anh">Tiếng Anh</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterPackage} onValueChange={setFilterPackage}>
              <SelectTrigger className="h-8 w-52 text-xs" data-testid="filter-package">
                <SelectValue placeholder="Gói lương đứng lớp" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả gói lương</SelectItem>
                <SelectItem value="200k">Lương 200k/buổi</SelectItem>
                <SelectItem value="100k">Lương 100k/h</SelectItem>
                <SelectItem value="moc">Mốc 50h</SelectItem>
              </SelectContent>
            </Select>

            <div className="ml-auto flex items-center gap-2">
              {selectedRows.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1.5 border-emerald-500 text-emerald-600 hover:bg-emerald-50"
                  data-testid="button-bulk-pay"
                >
                  <Banknote className="h-3.5 w-3.5" />
                  Chi lương {selectedRows.length} người
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable table area */}
        <div className="flex-1 overflow-auto min-h-0">
          <table className="w-max min-w-full border-collapse text-xs">
            <thead className="sticky top-0 z-20 bg-card">
              <tr>
                {/* Sticky fixed left columns */}
                <th className="sticky left-0 z-30 bg-card border-b border-r w-8 px-2 py-2.5 text-center">
                  <Checkbox
                    checked={selectedRows.length === MOCK_ROWS.length && MOCK_ROWS.length > 0}
                    onCheckedChange={toggleAll}
                    data-testid="checkbox-all"
                  />
                </th>
                <th className="sticky left-8 z-30 bg-card border-b border-r px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap min-w-[90px]">
                  Tên
                </th>
                <th className="sticky left-[calc(32px+90px)] z-30 bg-card border-b border-r px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap min-w-[80px]">
                  Lịch học
                </th>
                <th className="border-b border-r px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap min-w-[80px]">
                  Bộ môn
                </th>
                <th className="border-b border-r px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap min-w-[90px]">
                  Vai trò
                </th>
                <th className="border-b border-r px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap min-w-[130px]">
                  Gói lương
                </th>

                {/* Dynamic date columns */}
                {dates.map((date, i) => {
                  const dayIdx = getDay(date);
                  const dayLabel = VIET_DAYS[dayIdx];
                  const dateStr = format(date, "dd/MM");
                  const isSunday = dayIdx === 0;
                  return (
                    <th
                      key={i}
                      className={cn(
                        "border-b border-r px-1 py-1.5 text-center font-semibold whitespace-nowrap min-w-[72px]",
                        isSunday ? "text-red-500" : "text-primary"
                      )}
                    >
                      <div className="font-bold text-[11px]">
                        {dayLabel} {dateStr}
                      </div>
                      <div className="text-[10px] font-normal text-muted-foreground">
                        07:00–09:00
                      </div>
                    </th>
                  );
                })}

                {/* Trailing fixed columns */}
                <th className="border-b border-r px-3 py-2.5 text-center font-semibold text-muted-foreground whitespace-nowrap min-w-[80px]">
                  Tổng số
                </th>
                <th className="border-b border-r px-3 py-2.5 text-center font-semibold text-muted-foreground whitespace-nowrap min-w-[100px]">
                  Tổng lương
                </th>
                <th className="sticky right-0 z-30 bg-card border-b px-3 py-2.5 text-center font-semibold whitespace-nowrap min-w-[90px] text-emerald-600">
                  Chi lương
                </th>
              </tr>
            </thead>
            <tbody>
              {MOCK_ROWS.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    "hover:bg-muted/30 transition-colors",
                    selectedRows.includes(row.id) && "bg-primary/5"
                  )}
                  data-testid={`row-teacher-${row.id}`}
                >
                  {/* Checkbox */}
                  <td className="sticky left-0 z-10 bg-inherit border-b border-r w-8 px-2 py-2 text-center">
                    <Checkbox
                      checked={selectedRows.includes(row.id)}
                      onCheckedChange={() => toggleRow(row.id)}
                      data-testid={`checkbox-row-${row.id}`}
                    />
                  </td>

                  {/* Tên */}
                  <td className="sticky left-8 z-10 bg-inherit border-b border-r px-3 py-2 font-medium whitespace-nowrap">
                    {row.code}
                  </td>

                  {/* Lịch học */}
                  <td className="sticky left-[calc(32px+90px)] z-10 bg-inherit border-b border-r px-3 py-2 whitespace-nowrap">
                    {row.schedule}
                  </td>

                  {/* Bộ môn */}
                  <td className="border-b border-r px-3 py-2 text-muted-foreground whitespace-nowrap">
                    {row.subject}
                  </td>

                  {/* Vai trò */}
                  <td className="border-b border-r px-3 py-2 whitespace-nowrap">
                    <Badge variant="outline" className="text-[10px] font-normal">
                      {row.role}
                    </Badge>
                  </td>

                  {/* Gói lương */}
                  <td className="border-b border-r px-3 py-2 whitespace-nowrap">
                    {row.hasPkg ? (
                      <span className="text-foreground">{row.pkg}</span>
                    ) : (
                      <span className="text-muted-foreground italic">Chưa gắn</span>
                    )}
                  </td>

                  {/* Date cells */}
                  {dates.map((_, i) => {
                    const hasSession = row.sessionDayIndices.includes(i);
                    return (
                      <td
                        key={i}
                        className={cn(
                          "border-b border-r px-1 py-2 text-center",
                          hasSession
                            ? "bg-violet-100 dark:bg-violet-900/30"
                            : ""
                        )}
                      >
                        {hasSession && (
                          <span className="text-[10px] text-violet-700 dark:text-violet-300 font-medium">
                            ✓
                          </span>
                        )}
                      </td>
                    );
                  })}

                  {/* Tổng số */}
                  <td className="border-b border-r px-3 py-2 text-center whitespace-nowrap font-medium">
                    {row.total === "-" ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      row.total
                    )}
                  </td>

                  {/* Tổng lương */}
                  <td className="border-b border-r px-3 py-2 text-center whitespace-nowrap font-semibold">
                    {row.totalSalary === "-" ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className={row.totalSalary === "0đ" ? "text-muted-foreground" : "text-foreground"}>
                        {row.totalSalary}
                      </span>
                    )}
                  </td>

                  {/* Chi lương */}
                  <td className="sticky right-0 z-10 bg-card border-b px-2 py-2 text-center">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2.5 text-[11px] gap-1 border-emerald-400 text-emerald-600 hover:bg-emerald-50 hover:border-emerald-500"
                      data-testid={`button-pay-${row.id}`}
                    >
                      <Banknote className="h-3 w-3" />
                      Chi
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t shrink-0 flex items-center justify-between bg-muted/20">
          <p className="text-xs text-muted-foreground">
            {MOCK_ROWS.length} giáo viên / trợ giảng
            {selectedRows.length > 0 && (
              <span className="ml-2 text-primary font-medium">
                · Đã chọn {selectedRows.length}
              </span>
            )}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            data-testid="button-close-sheet"
          >
            <X className="h-4 w-4 mr-1" />
            Đóng
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
