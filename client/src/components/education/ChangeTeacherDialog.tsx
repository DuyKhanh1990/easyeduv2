import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronRight, AlertCircle, Search, X } from "lucide-react";
import { usePastSchedulePolicy } from "@/hooks/use-past-schedule-policy";
import { getCenterDateString, isPastCenterDate } from "@/lib/center-time-format";
import {
  getStaffRoleOptions,
  isDefaultTrainingDepartmentStaff,
  resolveTeacherRoleId,
} from "@/lib/staff-role-options";

const USE_DEFAULT_ROLE = "__use_default_role__";

export function ChangeTeacherDialog({
  isOpen,
  onOpenChange,
  classData,
  classSessions,
  selectedSessionId,
  onConfirm,
  isPending,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  classData: any;
  classSessions: any[];
  selectedSessionId?: string;
  onConfirm: (data: any) => void;
  isPending: boolean;
}) {
  const [newTeacherIds, setNewTeacherIds] = useState<string[]>([]);
  const [fromSessionId, setFromSessionId] = useState<string>("");
  const [toSessionId, setToSessionId] = useState<string>("");
  const [teacherSearch, setTeacherSearch] = useState<string>("");
  const [teacherRoleChanges, setTeacherRoleChanges] = useState<Record<string, string | null>>({});
  const { data: pastSchedulePolicy } = usePastSchedulePolicy(isOpen);
  const canRunPast = pastSchedulePolicy?.canRunPast === true;
  const today = getCenterDateString();
  const selectableSessions = (classSessions ?? []).filter((session) =>
    canRunPast || !session.sessionDate || !isPastCenterDate(session.sessionDate),
  );

  const selectedSession = classSessions?.find((s) => s.id === selectedSessionId);
  const currentSessionTeachers: { id: string; fullName: string }[] =
    selectedSession?.teachers ?? classData?.teachers ?? [];

  useEffect(() => {
    if (isOpen) {
      if (selectedSessionId && selectableSessions.some((session) => session.id === selectedSessionId)) {
        setFromSessionId(selectedSessionId);
      } else if (selectableSessions.length > 0) {
        setFromSessionId(selectableSessions[0].id);
      }

      if (selectableSessions.length > 0) {
        const lastSession = selectableSessions.reduce((latest, current) =>
          (current.sessionIndex ?? -1) > (latest.sessionIndex ?? -1) ? current : latest
        );
        setToSessionId(lastSession.id);
      }

      const sessionTeacherIds = (selectedSession?.teachers ?? []).map((t: any) => t.id);
      setNewTeacherIds(sessionTeacherIds);
      setTeacherSearch("");
      setTeacherRoleChanges({});
    }
  }, [isOpen, selectedSessionId, classSessions, canRunPast]);

  const { data: staffList } = useQuery<any[]>({
    queryKey: ["/api/staff?minimal=true"],
    enabled: isOpen,
  });

  const eligibleTeachers = [...(staffList || [])]
    .filter(isDefaultTrainingDepartmentStaff)
    .sort((a: any, b: any) => {
    const aActive = a.status !== "Không hoạt động";
    const bActive = b.status !== "Không hoạt động";
    if (aActive === bActive) return 0;
    return aActive ? -1 : 1;
  });

  const filteredTeachers = teacherSearch.trim()
    ? eligibleTeachers.filter((t: any) =>
        (t.fullName || "").toLowerCase().includes(teacherSearch.toLowerCase()) ||
        (t.code || "").toLowerCase().includes(teacherSearch.toLowerCase())
      )
    : eligibleTeachers;

  const selectedTeacherEntries = newTeacherIds.map((teacherId) => {
    const eligibleTeacher = eligibleTeachers.find((teacher: any) => teacher.id === teacherId);
    const fallbackTeacher = [
      ...currentSessionTeachers,
      ...(Array.isArray(classData?.teachers) ? classData.teachers : []),
    ].find((teacher: any) => teacher?.id === teacherId);
    return eligibleTeacher ?? fallbackTeacher ?? { id: teacherId, fullName: teacherId };
  });

  const getTeacherRoleDetails = (teacherId: string) => {
    const teacher = eligibleTeachers.find((member: any) => member.id === teacherId);
    const sessionTeacher = selectedSession?.teachers?.find((member: any) => member.id === teacherId);
    const roleOptions = getStaffRoleOptions(teacher, classData?.locationId);
    const classTeacherConfig = (Array.isArray(classData?.teachersConfig) ? classData.teachersConfig : [])
      .find((member: any) => String(member?.teacher_id ?? member?.teacherId ?? "") === teacherId);
    const configuredRoleId = resolveTeacherRoleId(classTeacherConfig, roleOptions);
    const singleRoleId = resolveTeacherRoleId({}, roleOptions);
    const defaultRoleId = [sessionTeacher?.defaultRoleId, configuredRoleId, singleRoleId]
      .find((roleId) => roleId && roleOptions.some((option) => option.id === roleId)) || "";
    const sessionRoleIds = selectedSession?.teacherRoleIds;
    const savedRoleId = sessionRoleIds && typeof sessionRoleIds === "object" && !Array.isArray(sessionRoleIds)
      ? sessionRoleIds[teacherId]
      : undefined;
    const currentRoleId = [savedRoleId, sessionTeacher?.roleId, sessionTeacher?.role_id, defaultRoleId]
      .find((roleId) => typeof roleId === "string" && roleOptions.some((option) => option.id === roleId)) || "";
    const hasChange = Object.prototype.hasOwnProperty.call(teacherRoleChanges, teacherId);
    const selectedRoleId = hasChange
      ? teacherRoleChanges[teacherId] ?? USE_DEFAULT_ROLE
      : currentRoleId;
    const needsRoleSelection = roleOptions.length > 1 &&
      (!selectedRoleId || (selectedRoleId === USE_DEFAULT_ROLE && !defaultRoleId));

    return { roleOptions, defaultRoleId, selectedRoleId, needsRoleSelection };
  };

  const hasMissingTeacherRoles = selectedTeacherEntries.some((teacher: any) =>
    getTeacherRoleDetails(String(teacher.id)).needsRoleSelection
  );

  const handleTeacherToggle = (id: string) => {
    const nextTeacherIds = newTeacherIds.includes(id)
      ? newTeacherIds.filter((teacherId) => teacherId !== id)
      : [...newTeacherIds, id];
    setNewTeacherIds(nextTeacherIds);
    setTeacherRoleChanges((current) => Object.fromEntries(
      Object.entries(current).filter(([teacherId]) => nextTeacherIds.includes(teacherId)),
    ));
  };

  const handleTeacherRoleChange = (teacherId: string, roleId: string) => {
    setTeacherRoleChanges((current) => ({
      ...current,
      [teacherId]: roleId === USE_DEFAULT_ROLE ? null : roleId,
    }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-[750px]">
        <DialogHeader>
          <DialogTitle>Đổi giáo viên</DialogTitle>
          <DialogDescription>Chọn giáo viên, vai trò và phạm vi buổi áp dụng.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Giáo viên hiện tại</Label>
            <div className="p-2 bg-muted rounded-md text-sm font-medium min-h-[36px]">
              {currentSessionTeachers.length > 0
                ? currentSessionTeachers.map((t) => t.fullName).join(", ")
                : "Chưa phân công"}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Chọn giáo viên mới (có thể chọn nhiều)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between font-normal">
                  <span className="truncate text-muted-foreground">
                    {newTeacherIds.length > 0
                      ? `${newTeacherIds.length} giáo viên được chọn`
                      : "Chọn giáo viên"}
                  </span>
                  <ChevronRight className="h-4 w-4 opacity-50 rotate-90" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[540px] max-w-[calc(100vw-3rem)] p-0" align="start">
                <div className="p-2 border-b">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Tìm nhân sự Phòng Đào tạo..."
                      className="pl-7 h-8 text-sm"
                      value={teacherSearch}
                      onChange={(e) => setTeacherSearch(e.target.value)}
                    />
                  </div>
                </div>
                <ScrollArea className="h-[200px]">
                  <div className="p-2 space-y-1">
                    {filteredTeachers.map((t: any) => {
                      const isInactive = t.status === "Không hoạt động";
                      return (
                        <div
                          key={t.id}
                          className={`flex items-center space-x-2 p-2 rounded-sm ${isInactive ? "opacity-40 cursor-not-allowed" : "hover:bg-muted cursor-pointer"}`}
                          onClick={() => !isInactive && handleTeacherToggle(t.id)}
                        >
                          <Checkbox checked={newTeacherIds.includes(t.id)} disabled={isInactive} />
                          <span className="text-sm flex-1">{t.fullName}</span>
                          {isInactive && (
                            <span title="Không hoạt động">
                              <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                            </span>
                          )}
                        </div>
                      );
                    })}
                    {filteredTeachers.length === 0 && (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        Không tìm thấy nhân sự thuộc Phòng Đào tạo mặc định
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>

            {newTeacherIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {selectedTeacherEntries.map((teacher: any) => (
                  <Badge key={teacher.id} variant="secondary" className="text-xs gap-1 pr-1">
                    {teacher.fullName || teacher.name || teacher.id}
                    <button
                      type="button"
                      onClick={() => handleTeacherToggle(teacher.id)}
                      className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {newTeacherIds.length > 0 && (
              <div className="overflow-hidden rounded-md border">
                <div className="border-b bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  Vai trò chỉ được cập nhật trên các buổi đã chọn khi thay đổi tại đây.
                </div>
                <div className="hidden gap-3 bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.9fr)]">
                  <span>Tên giáo viên</span>
                  <span>Vai trò</span>
                </div>
                <div className="divide-y">
                  {selectedTeacherEntries.map((teacher: any) => {
                    const teacherId = String(teacher.id);
                    const details = getTeacherRoleDetails(teacherId);
                    return (
                      <div
                        key={teacherId}
                        className="grid grid-cols-1 gap-2 px-3 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.9fr)] lg:items-start lg:gap-3"
                      >
                        <span className="min-w-0 truncate text-sm font-medium lg:pt-2">
                          {teacher.fullName || teacher.name || teacherId}
                        </span>
                        <div className="min-w-0 space-y-1">
                          <span className="text-xs text-muted-foreground lg:hidden">Vai trò</span>
                          <Select
                            value={details.selectedRoleId}
                            onValueChange={(value) => handleTeacherRoleChange(teacherId, value)}
                            disabled={details.roleOptions.length === 0}
                          >
                            <SelectTrigger className={`h-9 ${details.needsRoleSelection ? "border-destructive" : ""}`}>
                              <SelectValue placeholder="Chọn vai trò" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={USE_DEFAULT_ROLE}>Theo mặc định</SelectItem>
                              {details.roleOptions.map((option) => (
                                <SelectItem key={option.id} value={option.id}>
                                  {option.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {details.needsRoleSelection && (
                            <p className="text-xs text-destructive">
                              Chọn vai trò cho giáo viên có nhiều vai trò tại cơ sở.
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Từ buổi</Label>
              <Select value={fromSessionId} onValueChange={setFromSessionId}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn buổi" />
                </SelectTrigger>
                <SelectContent>
                  {(classSessions ?? []).map((s) => {
                    const pastRestricted = !canRunPast
                      && s.sessionDate
                      && isPastCenterDate(s.sessionDate, today);
                    return <SelectItem
                      key={s.id}
                      value={s.id}
                      disabled={Boolean(pastRestricted)}
                      className={pastRestricted ? "opacity-50" : undefined}
                    >
                      Buổi {String(s.sessionIndex ?? "?").padStart(2, "0")} -{" "}
                      {format(new Date(s.sessionDate), "dd/MM/yyyy")}
                    </SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Đến buổi</Label>
              <Select value={toSessionId} onValueChange={setToSessionId}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn buổi" />
                </SelectTrigger>
                <SelectContent>
                  {(classSessions ?? []).map((s) => {
                    const pastRestricted = !canRunPast
                      && s.sessionDate
                      && isPastCenterDate(s.sessionDate, today);
                    return <SelectItem
                      key={s.id}
                      value={s.id}
                      disabled={Boolean(pastRestricted)}
                      className={pastRestricted ? "opacity-50" : undefined}
                    >
                      Buổi {String(s.sessionIndex ?? "?").padStart(2, "0")} -{" "}
                      {format(new Date(s.sessionDate), "dd/MM/yyyy")}
                    </SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            disabled={newTeacherIds.length === 0 || !fromSessionId || !toSessionId || hasMissingTeacherRoles || isPending}
            onClick={() => onConfirm({ newTeacherIds, fromSessionId, toSessionId, teacherRoleChanges })}
          >
            {isPending ? "Đang xử lý..." : "Xác nhận đổi"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
