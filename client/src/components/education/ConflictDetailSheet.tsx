import { format } from "date-fns";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Home, User, Clock } from "lucide-react";

export interface ConflictItem {
  type: "room" | "teacher" | "availability";
  sessionDate: string;
  shiftName: string;
  shiftTime: string;
  resourceName: string;
  conflictClassName: string;
  conflictClassCode: string;
  reason?: string;
}

interface ConflictDetailSheetProps {
  conflicts: ConflictItem[];
  title?: string;
  open: boolean;
  onClose: () => void;
}

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr + "T00:00:00");
    const day = d.getDay();
    const dayLabel = day === 0 ? "CN" : `T${day + 1}`;
    return `${dayLabel}, ${format(d, "dd/MM/yyyy")}`;
  } catch {
    return dateStr;
  }
}

export function ConflictDetailSheet({ conflicts, title, open, onClose }: ConflictDetailSheetProps) {
  const roomConflicts = conflicts.filter(c => c.type === "room");
  const teacherConflicts = conflicts.filter(c => c.type === "teacher");
  const availabilityConflicts = conflicts.filter(c => c.type === "availability");

  // Get all unique dates sorted ascending
  const allDates = Array.from(new Set(conflicts.map(c => c.sessionDate))).sort();

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="!max-w-none w-[96vw] sm:w-[960px] flex flex-col p-0 gap-0">
        <SheetHeader className="px-5 py-4 border-b">
          <SheetTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            {title || `Cảnh báo lịch (${conflicts.length} buổi)`}
          </SheetTitle>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {roomConflicts.length > 0 && (
              <Badge variant="outline" className="border-orange-300 text-orange-600 font-normal text-xs">
                <Home className="h-3 w-3 mr-1" />{roomConflicts.length} buổi trùng phòng
              </Badge>
            )}
            {teacherConflicts.length > 0 && (
              <Badge variant="outline" className="border-blue-300 text-blue-600 font-normal text-xs">
                <User className="h-3 w-3 mr-1" />{teacherConflicts.length} buổi trùng giáo viên
              </Badge>
            )}
            {availabilityConflicts.length > 0 && (
              <Badge variant="outline" className="border-amber-300 text-amber-700 font-normal text-xs">
                <Clock className="h-3 w-3 mr-1" />{availabilityConflicts.length} buổi ngoài giờ rảnh
              </Badge>
            )}
          </div>
        </SheetHeader>

        {/* Column headers */}
        <div className="grid grid-cols-3 gap-0 border-b bg-muted/40 px-5 py-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-orange-600">
            <Home className="h-3.5 w-3.5" /> Trùng phòng học ({roomConflicts.length})
          </div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 pl-4 border-l">
            <User className="h-3.5 w-3.5" /> Trùng lịch giáo viên ({teacherConflicts.length})
          </div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 pl-4 border-l">
            <Clock className="h-3.5 w-3.5" /> Ngoài giờ rảnh ({availabilityConflicts.length})
          </div>
        </div>

        <ScrollArea className="flex-1 px-5 py-4">
          <div className="space-y-6">
            {allDates.map(date => {
              const dayRooms = roomConflicts.filter(c => c.sessionDate === date);
              const dayTeachers = teacherConflicts.filter(c => c.sessionDate === date);
              const dayAvailability = availabilityConflicts.filter(c => c.sessionDate === date);
              if (dayRooms.length === 0 && dayTeachers.length === 0 && dayAvailability.length === 0) return null;

              return (
                <div key={date}>
                  {/* Date header */}
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-xs font-semibold text-muted-foreground px-2 py-0.5 bg-muted rounded-full whitespace-nowrap">
                      {formatDate(date)}
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    {/* Room column */}
                    <div className="space-y-1.5">
                      {dayRooms.length > 0 ? dayRooms.map((c, i) => (
                        <div key={i} className="rounded-md border border-orange-100 bg-orange-50 px-3 py-2.5 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-orange-800">{c.resourceName}</span>
                            <Badge variant="outline" className="text-xs border-orange-200 text-orange-700 shrink-0">
                              {c.shiftTime}
                            </Badge>
                          </div>
                          <div className="mt-0.5 text-xs text-orange-600">
                            Đang dùng bởi: <span className="font-medium">{c.conflictClassCode || c.conflictClassName}</span>
                          </div>
                        </div>
                      )) : (
                        <div className="rounded-md border border-dashed border-orange-100 px-3 py-2 text-xs text-orange-300 italic text-center">
                          Không có
                        </div>
                      )}
                    </div>

                    {/* Teacher column */}
                    <div className="space-y-1.5">
                      {dayTeachers.length > 0 ? dayTeachers.map((c, i) => (
                        <div key={i} className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2.5 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-blue-800">{c.resourceName}</span>
                            <Badge variant="outline" className="text-xs border-blue-200 text-blue-700 shrink-0">
                              {c.shiftTime}
                            </Badge>
                          </div>
                          <div className="mt-0.5 text-xs text-blue-600">
                            Đang dạy lớp: <span className="font-medium">{c.conflictClassCode || c.conflictClassName}</span>
                          </div>
                        </div>
                      )) : (
                        <div className="rounded-md border border-dashed border-blue-100 px-3 py-2 text-xs text-blue-300 italic text-center">
                          Không có
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      {dayAvailability.length > 0 ? dayAvailability.map((c, i) => (
                        <div key={i} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-amber-900">{c.resourceName}</span>
                            <Badge variant="outline" className="text-xs border-amber-300 text-amber-800 shrink-0">
                              {c.shiftTime}
                            </Badge>
                          </div>
                          <div className="mt-0.5 text-xs text-amber-800">
                            {c.reason || c.conflictClassName}
                          </div>
                        </div>
                      )) : (
                        <div className="rounded-md border border-dashed border-amber-100 px-3 py-2 text-xs text-amber-300 italic text-center">
                          Không có
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
