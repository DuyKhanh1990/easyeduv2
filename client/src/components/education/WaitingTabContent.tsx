import { useState, useEffect } from "react";
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
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserPlus, Plus, Search, Trash2 } from "lucide-react";
import { ScheduleDialog } from "@/components/education/ScheduleDialog";
import { ClassScheduleSetupDialog } from "@/components/education/ClassScheduleSetupDialog";
import { useLocations } from "@/hooks/use-locations";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ClassPermissions } from "@/pages/education/ClassDetail";

interface QuickAddStudentForm {
  locationId: string;
  type: "Học viên" | "Phụ huynh";
  code: string;
  fullName: string;
  username: string;
  password: string;
  dateOfBirth: string;
  phone: string;
  email: string;
  parentName: string;
  parentPhone: string;
}

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
  const { toast } = useToast();
  const { data: locations } = useLocations();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);

  // Track students just created via nested quick-add (shown at top of list, pre-selected)
  const [justAddedStudents, setJustAddedStudents] = useState<any[]>([]);
  // Nested quick-add dialog (inside "Thêm học viên" dialog)
  const [isNestedQuickAddOpen, setIsNestedQuickAddOpen] = useState(false);
  const [nestedSaving, setNestedSaving] = useState(false);

  // Quick-add new student state
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickAddSaving, setQuickAddSaving] = useState(false);
  const defaultLocationId = classData?.locationId ?? "";
  const emptyQuickForm = (): QuickAddStudentForm => ({
    locationId: defaultLocationId,
    type: "Học viên",
    code: "",
    fullName: "",
    username: "",
    password: "123456",
    dateOfBirth: "",
    phone: "",
    email: "",
    parentName: "",
    parentPhone: "",
  });
  const [quickForm, setQuickForm] = useState<QuickAddStudentForm>(emptyQuickForm());

  const { data: nextCodeData, refetch: refetchNextCode } = useQuery<{ code: string }>({
    queryKey: ["/api/students/next-code-quick", quickForm.type],
    queryFn: async () => {
      const res = await fetch(`/api/students/next-code?type=${encodeURIComponent(quickForm.type)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch next code");
      return res.json();
    },
    enabled: isQuickAddOpen || isNestedQuickAddOpen,
  });

  useEffect(() => {
    if ((isQuickAddOpen || isNestedQuickAddOpen) && nextCodeData?.code) {
      setQuickForm(f => ({ ...f, code: nextCodeData.code, username: nextCodeData.code }));
    }
  }, [nextCodeData, isQuickAddOpen, isNestedQuickAddOpen]);

  useEffect(() => {
    if (isQuickAddOpen) {
      refetchNextCode();
      setQuickForm(emptyQuickForm());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isQuickAddOpen]);

  useEffect(() => {
    if (isNestedQuickAddOpen) {
      refetchNextCode();
      setQuickForm(emptyQuickForm());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNestedQuickAddOpen]);

  const handleNestedSave = async () => {
    if (!quickForm.fullName.trim()) {
      toast({ title: "Lỗi", description: "Vui lòng nhập Tên học viên", variant: "destructive" }); return;
    }
    if (!quickForm.code.trim()) {
      toast({ title: "Lỗi", description: "Vui lòng nhập Mã", variant: "destructive" }); return;
    }
    if (!quickForm.locationId) {
      toast({ title: "Lỗi", description: "Vui lòng chọn Cơ sở", variant: "destructive" }); return;
    }
    setNestedSaving(true);
    try {
      const res = await apiRequest("POST", "/api/students", {
        locationIds: [quickForm.locationId],
        type: quickForm.type,
        code: quickForm.code.trim(),
        fullName: quickForm.fullName.trim(),
        username: quickForm.username.trim() || quickForm.code.trim(),
        password: quickForm.password || "123456",
        dateOfBirth: quickForm.dateOfBirth || null,
        phone: quickForm.phone || "",
        email: quickForm.email || null,
        parentName: quickForm.parentName || "",
        parentPhone: quickForm.parentPhone || "",
      });
      const created = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/available-students`] });
      setJustAddedStudents(prev => [created, ...prev]);
      setSelectedStudents(prev => [created.id, ...prev]);
      setIsNestedQuickAddOpen(false);
      toast({ title: "Đã tạo", description: `"${created.fullName}" đã thêm vào danh sách` });
    } catch (err: any) {
      toast({ title: "Lỗi", description: err.message || "Không thể tạo học viên", variant: "destructive" });
    } finally {
      setNestedSaving(false);
    }
  };

  const setQF = (field: keyof QuickAddStudentForm, value: string) => {
    setQuickForm(f => {
      const updated = { ...f, [field]: value };
      if (field === "code") updated.username = value;
      if (field === "type") updated.code = "";
      return updated;
    });
  };

  const handleQuickAddSave = async () => {
    if (!quickForm.fullName.trim()) {
      toast({ title: "Lỗi", description: "Vui lòng nhập Tên học viên", variant: "destructive" });
      return;
    }
    if (!quickForm.code.trim()) {
      toast({ title: "Lỗi", description: "Vui lòng nhập Mã", variant: "destructive" });
      return;
    }
    if (!quickForm.locationId) {
      toast({ title: "Lỗi", description: "Vui lòng chọn Cơ sở", variant: "destructive" });
      return;
    }
    setQuickAddSaving(true);
    try {
      const res = await apiRequest("POST", "/api/students", {
        locationIds: [quickForm.locationId],
        type: quickForm.type,
        code: quickForm.code.trim(),
        fullName: quickForm.fullName.trim(),
        username: quickForm.username.trim() || quickForm.code.trim(),
        password: quickForm.password || "123456",
        dateOfBirth: quickForm.dateOfBirth || null,
        phone: quickForm.phone || "",
        email: quickForm.email || null,
        parentName: quickForm.parentName || "",
        parentPhone: quickForm.parentPhone || "",
      });
      const created = await res.json();
      // Add newly created student to waiting list
      await apiRequest("POST", `/api/classes/${classId}/add-students`, {
        studentIds: [created.id],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/waiting-students`] });
      toast({ title: "Thành công", description: `Đã thêm "${quickForm.fullName}" vào danh sách chờ` });
      setIsQuickAddOpen(false);
    } catch (err: any) {
      toast({ title: "Lỗi", description: err.message || "Không thể thêm học viên", variant: "destructive" });
    } finally {
      setQuickAddSaving(false);
    }
  };
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [selectedForSchedule, setSelectedForSchedule] = useState<string[]>([]);
  const [isScheduleForSessionOpen, setIsScheduleForSessionOpen] = useState(false);
  const [selectedStudentsForSession, setSelectedStudentsForSession] = useState<string[]>([]);
  const [searchTermForSession, setSearchTermForSession] = useState("");
  const [isSetupDialogOpen, setIsSetupDialogOpen] = useState(false);
  const [freshSessions, setFreshSessions] = useState<any[] | null>(null);
  const [listSearch, setListSearch] = useState("");
  const [confirmRemoveId, setConfirmRemoveId] = useState<{ studentClassId: string; name: string } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data: availableStudents } = useQuery<any[]>({
    queryKey: [`/api/classes/${classId}/available-students`, searchTerm],
    queryFn: async () => {
      const url = searchTerm
        ? `/api/classes/${classId}/available-students?searchTerm=${encodeURIComponent(searchTerm)}`
        : `/api/classes/${classId}/available-students`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch students");
      return res.json();
    },
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

  const { addStudentsMutation, scheduleMutation, removeWaitingStudentMutation } = useClassMutations(classId);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm flex flex-col h-full overflow-hidden">
      {/* Fixed header - toolbar + search */}
      <div className="shrink-0 bg-card border-b border-border/50 px-6 py-4 space-y-3">
      <div className="flex justify-between items-center">
        <div className="flex gap-2">
          {canAdd && (
          <>
          <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
            setIsAddDialogOpen(open);
            if (!open) { setShowInlineCreate(false); setJustAddedStudents([]); setSelectedStudents([]); }
          }}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" data-testid="button-add-student">
                <UserPlus className="mr-2 h-4 w-4" /> Thêm học viên
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <div className="flex items-center justify-between pr-6">
                  <DialogTitle>Thêm học viên vào lớp</DialogTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => setIsNestedQuickAddOpen(true)}
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Thêm mới học viên
                  </Button>
                </div>
              </DialogHeader>

              {/* Nested quick-add dialog */}
              <Dialog open={isNestedQuickAddOpen} onOpenChange={setIsNestedQuickAddOpen}>
                <DialogContent className="max-w-xl z-[200]">
                  <DialogHeader>
                    <DialogTitle>Thêm mới học viên nhanh</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium">Cơ sở <span className="text-destructive">*</span></Label>
                        <Select value={quickForm.locationId} onValueChange={v => setQF("locationId", v)}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Chọn cơ sở..." /></SelectTrigger>
                          <SelectContent>
                            {(locations ?? []).map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium">Phân loại</Label>
                        <Select value={quickForm.type} onValueChange={v => setQF("type", v as any)}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Học viên">Học viên</SelectItem>
                            <SelectItem value="Phụ huynh">Phụ huynh</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium">Mã <span className="text-destructive">*</span></Label>
                        <Input className="h-9 text-sm" value={quickForm.code} onChange={e => setQF("code", e.target.value)} placeholder="VD: HV-01" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium">Tên <span className="text-destructive">*</span></Label>
                        <Input className="h-9 text-sm" value={quickForm.fullName} onChange={e => setQF("fullName", e.target.value)} placeholder="Họ và tên..." />
                      </div>
                    </div>
                    <div className="border-t pt-3">
                      <p className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wide">Thông tin bổ sung</p>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium">Tài khoản</Label>
                          <Input className="h-9 text-sm" value={quickForm.username} onChange={e => setQuickForm(f => ({ ...f, username: e.target.value }))} placeholder="Tự sinh theo Mã" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium">Mật khẩu</Label>
                          <Input className="h-9 text-sm" value={quickForm.password} onChange={e => setQF("password", e.target.value)} placeholder="123456" />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3 mb-3">
                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium">Sinh nhật</Label>
                          <Input type="date" className="h-9 text-sm" value={quickForm.dateOfBirth} onChange={e => setQF("dateOfBirth", e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium">Số điện thoại</Label>
                          <Input className="h-9 text-sm" value={quickForm.phone} onChange={e => setQF("phone", e.target.value)} placeholder="SĐT..." />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium">Email</Label>
                          <Input className="h-9 text-sm" value={quickForm.email} onChange={e => setQF("email", e.target.value)} placeholder="Email..." />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium">Họ tên Phụ huynh 1</Label>
                          <Input className="h-9 text-sm" value={quickForm.parentName} onChange={e => setQF("parentName", e.target.value)} placeholder="Tên phụ huynh..." />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-sm font-medium">SĐT Phụ huynh 1</Label>
                          <Input className="h-9 text-sm" value={quickForm.parentPhone} onChange={e => setQF("parentPhone", e.target.value)} placeholder="SĐT phụ huynh..." />
                        </div>
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsNestedQuickAddOpen(false)} disabled={nestedSaving}>Hủy</Button>
                    <Button onClick={handleNestedSave} disabled={nestedSaving}>
                      {nestedSaving ? "Đang lưu..." : "Lưu & thêm vào danh sách"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <div className="space-y-4 py-2">
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
                      {/* Newly created students shown first with highlight */}
                      {justAddedStudents.map((s) => (
                        <TableRow key={s.id} className="bg-primary/5">
                          <TableCell>
                            <Checkbox
                              checked={selectedStudents.includes(s.id)}
                              onCheckedChange={(checked) => {
                                if (checked) setSelectedStudents(prev => [...prev, s.id]);
                                else setSelectedStudents(prev => prev.filter(id => id !== s.id));
                              }}
                            />
                          </TableCell>
                          <TableCell className="font-medium text-primary">{s.fullName}</TableCell>
                          <TableCell className="text-primary">{s.code}</TableCell>
                        </TableRow>
                      ))}
                      {availableStudents && availableStudents.filter(s => !justAddedStudents.some(j => j.id === s.id)).length > 0 ? (
                        availableStudents.filter(s => !justAddedStudents.some(j => j.id === s.id)).map((s) => {
                          const isInactive = s.accountStatus === "Không hoạt động";
                          return (
                            <TableRow key={s.id} className={isInactive ? "opacity-50" : ""}>
                              <TableCell>
                                <Checkbox
                                  disabled={isInactive}
                                  checked={selectedStudents.includes(s.id)}
                                  onCheckedChange={(checked) => {
                                    if (checked) setSelectedStudents([...selectedStudents, s.id]);
                                    else setSelectedStudents(selectedStudents.filter((id) => id !== s.id));
                                  }}
                                />
                              </TableCell>
                              <TableCell>
                                <span className={isInactive ? "text-muted-foreground" : ""}>{s.fullName}</span>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <span className={isInactive ? "text-muted-foreground" : ""}>{s.code}</span>
                                  {isInactive && (
                                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                                      Không hoạt động
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      ) : justAddedStudents.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                            Không có học viên nào
                          </TableCell>
                        </TableRow>
                      ) : null}
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
                        setJustAddedStudents([]);
                      },
                    })
                  }
                >
                  Thêm đã chọn ({selectedStudents.length})
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Quick-add new student dialog */}
          <Dialog open={isQuickAddOpen} onOpenChange={setIsQuickAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" data-testid="button-quick-add-student">
                <Plus className="mr-2 h-4 w-4" /> Thêm mới học viên
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Thêm mới học viên nhanh</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                {/* Row 1: Cơ sở + Phân loại */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Cơ sở <span className="text-destructive">*</span></Label>
                    <Select value={quickForm.locationId} onValueChange={v => setQF("locationId", v)}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Chọn cơ sở..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(locations ?? []).map((l: any) => (
                          <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Phân loại</Label>
                    <Select value={quickForm.type} onValueChange={v => setQF("type", v as any)}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Học viên">Học viên</SelectItem>
                        <SelectItem value="Phụ huynh">Phụ huynh</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {/* Row 2: Mã + Tên */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Mã <span className="text-destructive">*</span></Label>
                    <Input
                      className="h-9 text-sm"
                      value={quickForm.code}
                      onChange={e => setQF("code", e.target.value)}
                      placeholder="VD: HV-01"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Tên <span className="text-destructive">*</span></Label>
                    <Input
                      className="h-9 text-sm"
                      value={quickForm.fullName}
                      onChange={e => setQF("fullName", e.target.value)}
                      placeholder="Họ và tên..."
                    />
                  </div>
                </div>

                <div className="border-t pt-3">
                  <p className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wide">Thông tin bổ sung</p>
                  {/* Row: Tài khoản + Mật khẩu */}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Tài khoản</Label>
                      <Input
                        className="h-9 text-sm"
                        value={quickForm.username}
                        onChange={e => setQuickForm(f => ({ ...f, username: e.target.value }))}
                        placeholder="Tự sinh theo Mã"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Mật khẩu</Label>
                      <Input
                        className="h-9 text-sm"
                        value={quickForm.password}
                        onChange={e => setQF("password", e.target.value)}
                        placeholder="123456"
                      />
                    </div>
                  </div>
                  {/* Row: Sinh nhật + SĐT + Email */}
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Sinh nhật</Label>
                      <Input
                        type="date"
                        className="h-9 text-sm"
                        value={quickForm.dateOfBirth}
                        onChange={e => setQF("dateOfBirth", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Số điện thoại</Label>
                      <Input
                        className="h-9 text-sm"
                        value={quickForm.phone}
                        onChange={e => setQF("phone", e.target.value)}
                        placeholder="SĐT..."
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Email</Label>
                      <Input
                        className="h-9 text-sm"
                        value={quickForm.email}
                        onChange={e => setQF("email", e.target.value)}
                        placeholder="Email..."
                      />
                    </div>
                  </div>
                  {/* Row: Phụ huynh 1 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Họ tên Phụ huynh 1</Label>
                      <Input
                        className="h-9 text-sm"
                        value={quickForm.parentName}
                        onChange={e => setQF("parentName", e.target.value)}
                        placeholder="Tên phụ huynh..."
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">SĐT Phụ huynh 1</Label>
                      <Input
                        className="h-9 text-sm"
                        value={quickForm.parentPhone}
                        onChange={e => setQF("parentPhone", e.target.value)}
                        placeholder="SĐT phụ huynh..."
                      />
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsQuickAddOpen(false)} disabled={quickAddSaving}>
                  Hủy
                </Button>
                <Button onClick={handleQuickAddSave} disabled={quickAddSaving}>
                  {quickAddSaving ? "Đang lưu..." : "Lưu & thêm vào chờ"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </>
          )}

          {canEdit && (
          <Button
            size="sm"
            variant={selectedForSchedule.length > 0 ? "default" : "secondary"}
            disabled={selectedForSchedule.length === 0 || scheduleMutation.isPending}
            className={selectedForSchedule.length > 0 ? "bg-green-600 hover:bg-green-700 text-white" : ""}
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

      {/* Search bar (inside fixed header) */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Tìm theo tên / mã học viên..."
          className="pl-8 h-8 text-xs"
          value={listSearch}
          onChange={(e) => { setListSearch(e.target.value); setPage(1); }}
          data-testid="input-waiting-search"
        />
      </div>
      </div>{/* end fixed header */}

      {/* Scrollable table */}
      <div className="flex-1 overflow-auto">
      <div className="rounded-none border-0 bg-card">
        <Table>
          <TableHeader className="sticky top-0 bg-secondary/50 z-10">
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
              {canEdit && <TableHead className="w-[48px]"></TableHead>}
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
                {canEdit && (
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-red-50"
                      onClick={() => setConfirmRemoveId({ studentClassId: s.id, name: s.student?.fullName || "" })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {filteredWaiting.length === 0 && (
              <TableRow>
                <TableCell colSpan={canEdit ? 7 : 5} className="text-center py-8 text-muted-foreground">
                  {listSearch ? "Không tìm thấy học viên phù hợp" : "Không có học viên nào trong danh sách chờ"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      </div>{/* end scrollable table */}

      {/* Fixed footer - pagination */}
      <div className="shrink-0 px-6 py-3 border-t border-border/50">
        {filteredWaiting.length > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filteredWaiting.length)} / {filteredWaiting.length} học viên
            </span>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Hiển thị:</span>
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
                <span className="px-2 text-xs">{safePage} / {totalPages}</span>
                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>›</Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Confirm remove dialog */}
      <Dialog open={!!confirmRemoveId} onOpenChange={(open) => { if (!open) setConfirmRemoveId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Xoá khỏi danh sách chờ?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Bạn có chắc muốn loại <span className="font-semibold text-foreground">{confirmRemoveId?.name}</span> khỏi danh sách chờ không? Hành động này không thể hoàn tác.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmRemoveId(null)}>Huỷ</Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={removeWaitingStudentMutation.isPending}
              onClick={() => {
                if (!confirmRemoveId) return;
                removeWaitingStudentMutation.mutate(confirmRemoveId.studentClassId, {
                  onSuccess: () => setConfirmRemoveId(null),
                });
              }}
            >
              Xoá
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
