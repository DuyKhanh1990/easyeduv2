import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import { useClassMutations } from "@/hooks/use-class-mutations";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserPlus, Search } from "lucide-react";
import { ScheduleDialog } from "@/components/education/ScheduleDialog";
import { ClassScheduleSetupDialog } from "@/components/education/ClassScheduleSetupDialog";
import type { ClassPermissions } from "@/pages/education/ClassDetail";

interface WaitingTabContentProps {
  classId: string;
  classData: any;
  waitingStudents: any[] | undefined;
  classSessions: any[] | undefined;
  classPerm?: ClassPermissions;
}

export function WaitingTabContent({
  classId,
  classData,
  waitingStudents,
  classSessions,
  classPerm,
}: WaitingTabContentProps) {
  const canAdd = classPerm?.canAdd ?? true;
  const canEdit = classPerm?.canEdit ?? true;
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [selectedForSchedule, setSelectedForSchedule] = useState<string[]>([]);
  const [isScheduleForSessionOpen, setIsScheduleForSessionOpen] = useState(false);
  const [selectedStudentsForSession, setSelectedStudentsForSession] = useState<string[]>([]);
  const [searchTermForSession, setSearchTermForSession] = useState("");
  const [isSetupDialogOpen, setIsSetupDialogOpen] = useState(false);
  const [freshSessions, setFreshSessions] = useState<any[] | null>(null);
  const [listSearch, setListSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data: availableStudents } = useQuery<any[]>({
    queryKey: [`/api/classes/${classId}/available-students`, searchTerm],
    enabled: isAddDialogOpen,
  });

  const { data: localSessions } = useQuery<any[]>({
    queryKey: [`/api/classes/${classId}/sessions`],
    enabled: true,
    staleTime: 0,
    select: (data) =>
      [...data].sort((a, b) => {
        const dateA = new Date(a.sessionDate).getTime();
        const dateB = new Date(b.sessionDate).getTime();
        if (dateA !== dateB) return dateA - dateB;
        return a.id.localeCompare(b.id);
      }),
  });

  const effectiveSessions = classSessions ?? localSessions;

  const filteredAvailableStudentsForSession =
    waitingStudents?.filter(
      (s: any) =>
        s.fullName?.toLowerCase().includes(searchTermForSession.toLowerCase()) ||
        s.code?.toLowerCase().includes(searchTermForSession.toLowerCase())
    ) || [];

  const filteredWaiting = (waitingStudents || []).filter((s: any) => {
    if (!listSearch.trim()) return true;
    const q = listSearch.toLowerCase();
    return (
      s.student?.fullName?.toLowerCase().includes(q) ||
      s.student?.code?.toLowerCase().includes(q)
    );
  });
  const totalPages = Math.max(1, Math.ceil(filteredWaiting.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedWaiting = filteredWaiting.slice((safePage - 1) * pageSize, safePage * pageSize);
  const isAllSelected = paginatedWaiting.length > 0 && paginatedWaiting.every((s) => selectedForSchedule.includes(s.studentId));
  const isIndeterminate = !isAllSelected && paginatedWaiting.some((s) => selectedForSchedule.includes(s.studentId));

  const { addStudentsMutation, scheduleMutation } = useClassMutations(classId);

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-2">
          {canAdd && (
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" data-testid="button-add-student">
                <UserPlus className="mr-2 h-4 w-4" /> Thêm học viên
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Thêm học viên vào lớp</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Tìm theo tên / mã học viên..."
                    className="pl-8"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <ScrollArea className="h-[300px] border rounded-md p-2">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]"></TableHead>
                        <TableHead>Tên học viên</TableHead>
                        <TableHead>Mã</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {availableStudents && availableStudents.length > 0 ? (
                        availableStudents.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell>
                              <Checkbox
                                checked={selectedStudents.includes(s.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) setSelectedStudents([...selectedStudents, s.id]);
                                  else
                                    setSelectedStudents(
                                      selectedStudents.filter((id) => id !== s.id)
                                    );
                                }}
                              />
                            </TableCell>
                            <TableCell>{s.fullName}</TableCell>
                            <TableCell>{s.code}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell
                            colSpan={3}
                            className="text-center py-8 text-muted-foreground"
                          >
                            Không có học viên nào
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Hủy
                </Button>
                <Button
                  disabled={selectedStudents.length === 0 || addStudentsMutation.isPending}
                  onClick={() =>
                    addStudentsMutation.mutate(selectedStudents, {
                      onSuccess: () => {
                        setIsAddDialogOpen(false);
                        setSelectedStudents([]);
                      },
                    })
                  }
                >
                  Thêm đã chọn ({selectedStudents.length})
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          )}

          {canEdit && (
          <Button
            size="sm"
            variant="secondary"
            disabled={selectedForSchedule.length === 0 || scheduleMutation.isPending}
            onClick={() => {
              // Only show setup dialog if we KNOW the class has no sessions (empty array).
              // If still loading (undefined), open ScheduleDialog directly to avoid false positive.
              const hasNoSessions = Array.isArray(effectiveSessions) && effectiveSessions.length === 0;
              if (hasNoSessions) {
                setIsSetupDialogOpen(true);
              } else {
                setIsScheduleDialogOpen(true);
              }
            }}
            data-testid="button-schedule"
          >
            Xếp lịch ({selectedForSchedule.length})
          </Button>
          )}

          {isSetupDialogOpen && (
            <ClassScheduleSetupDialog
              isOpen={isSetupDialogOpen}
              onOpenChange={setIsSetupDialogOpen}
              classId={classId}
              classData={classData}
              locationId={classData?.locationId}
              onSuccess={(sessions) => {
                setFreshSessions(sessions);
                setIsScheduleDialogOpen(true);
              }}
            />
          )}

          {isScheduleDialogOpen && (
            <ScheduleDialog
              isOpen={isScheduleDialogOpen}
              onOpenChange={(open) => {
                setIsScheduleDialogOpen(open);
                if (!open) setFreshSessions(null);
              }}
              students={
                waitingStudents?.filter((s) => selectedForSchedule.includes(s.studentId)) || []
              }
              classData={classData}
              classSessions={freshSessions || effectiveSessions || []}
              hasNoSessions={false}
              locationId={classData?.locationId}
              onConfirm={(configs) =>
                scheduleMutation.mutate({ configs }, {
                  onSuccess: () => {
                    setSelectedForSchedule([]);
                    setIsScheduleDialogOpen(false);
                    setFreshSessions(null);
                  },
                })
              }
              isPending={scheduleMutation.isPending}
            />
          )}

          {isScheduleForSessionOpen && (
            <ScheduleDialog
              isOpen={isScheduleForSessionOpen}
              onOpenChange={(open) => {
                setIsScheduleForSessionOpen(open);
                if (!open) {
                  setSelectedStudentsForSession([]);
                  setSearchTermForSession("");
                }
              }}
              students={
                waitingStudents?.filter((s) =>
                  selectedStudentsForSession.includes(s.id)
                ) || []
              }
              classData={classData}
              classSessions={effectiveSessions || []}
              hasNoSessions={Array.isArray(effectiveSessions) && effectiveSessions.length === 0}
              locationId={classData?.locationId}
              onConfirm={(configs, classScheduleConfig) =>
                scheduleMutation.mutate({ configs, classScheduleConfig }, {
                  onSuccess: () => {
                    setSelectedStudentsForSession([]);
                    setIsScheduleForSessionOpen(false);
                    setSearchTermForSession("");
                  },
                })
              }
              isPending={scheduleMutation.isPending}
            />
          )}
        </div>
      </div>

      {/* Search bar */}
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Tìm theo tên / mã học viên..."
          className="pl-8 h-9 text-sm"
          value={listSearch}
          onChange={(e) => { setListSearch(e.target.value); setPage(1); }}
          data-testid="input-waiting-search"
        />
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {canEdit && (
                <TableHead className="w-[50px]">
                  <Checkbox
                    checked={isAllSelected}
                    data-state={isIndeterminate ? "indeterminate" : isAllSelected ? "checked" : "unchecked"}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        const toAdd = paginatedWaiting.map((s) => s.studentId).filter((id) => !selectedForSchedule.includes(id));
                        setSelectedForSchedule([...selectedForSchedule, ...toAdd]);
                      } else {
                        const pageIds = new Set(paginatedWaiting.map((s) => s.studentId));
                        setSelectedForSchedule(selectedForSchedule.filter((id) => !pageIds.has(id)));
                      }
                    }}
                    data-testid="checkbox-select-all-waiting"
                  />
                </TableHead>
              )}
              <TableHead>Tên</TableHead>
              <TableHead>Hóa đơn</TableHead>
              <TableHead>Công nợ</TableHead>
              <TableHead>Người tạo</TableHead>
              <TableHead>Ngày tạo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedWaiting.map((s) => (
              <TableRow key={s.id}>
                {canEdit && (
                  <TableCell>
                    <Checkbox
                      checked={selectedForSchedule.includes(s.studentId)}
                      onCheckedChange={(checked) => {
                        if (checked)
                          setSelectedForSchedule([...selectedForSchedule, s.studentId]);
                        else
                          setSelectedForSchedule(
                            selectedForSchedule.filter((id) => id !== s.studentId)
                          );
                      }}
                    />
                  </TableCell>
                )}
                <TableCell>
                  <Link
                    href={`/customers?id=${s.studentId}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {s.student?.fullName} ({s.student?.code})
                  </Link>
                </TableCell>
                <TableCell>
                  {s.hasInvoice ? (
                    <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200">Đã có</Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-gray-100 text-gray-500 border-gray-200">Chưa có</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <span className={s.debt > 0 ? "text-destructive font-medium" : "text-muted-foreground"}>
                    {new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(s.debt || 0)}
                  </span>
                </TableCell>
                <TableCell>{s.creator?.fullName || "Hệ thống"}</TableCell>
                <TableCell>{format(new Date(s.createdAt), "dd/MM/yyyy")}</TableCell>
              </TableRow>
            ))}
            {filteredWaiting.length === 0 && (
              <TableRow>
                <TableCell colSpan={canEdit ? 6 : 5} className="text-center py-8 text-muted-foreground">
                  {listSearch ? "Không tìm thấy học viên phù hợp" : "Không có học viên nào trong danh sách chờ"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {filteredWaiting.length > 0 && (
        <div className="flex items-center justify-between mt-3 text-sm text-muted-foreground">
          <span>
            {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filteredWaiting.length)} / {filteredWaiting.length} học viên
          </span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs">Hiển thị:</span>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                className="border rounded px-1.5 py-0.5 text-xs bg-background"
                data-testid="select-waiting-page-size"
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
    </>
  );
}
