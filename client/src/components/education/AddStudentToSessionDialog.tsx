import { useState, useEffect } from "react";
import { Search, UserPlus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface AddStudentToSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  filteredCandidates: any[];
  allCandidates: any[];
  isLoading: boolean;
  onConfirm: (students: { studentId: string; fullName: string; code: string; source: string }[]) => void;
  classId?: string;
  locationId?: string;
}

export function AddStudentToSessionDialog({
  open,
  onOpenChange,
  searchTerm,
  onSearchChange,
  selectedIds,
  onSelectionChange,
  filteredCandidates,
  allCandidates,
  isLoading,
  onConfirm,
  classId,
  locationId,
}: AddStudentToSessionDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Just-added students (created via quick-add, shown at top, pre-selected)
  const [justAdded, setJustAdded] = useState<any[]>([]);

  // Quick-add dialog state
  const [isQuickOpen, setIsQuickOpen] = useState(false);
  const [quickSaving, setQuickSaving] = useState(false);

  const emptyQF = () => ({
    locationId: locationId || "",
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
  const [qForm, setQForm] = useState(emptyQF());

  const setQF = (field: string, value: string) => {
    setQForm(f => {
      const u = { ...f, [field]: value };
      if (field === "code") u.username = value;
      if (field === "type") u.code = "";
      return u;
    });
  };

  const { data: locationsList = [] } = useQuery<any[]>({
    queryKey: ["/api/locations"],
    enabled: isQuickOpen,
  });

  const { data: nextCodeData, refetch: refetchNextCode } = useQuery<{ code: string }>({
    queryKey: ["/api/students/next-code-session", qForm.type],
    queryFn: async () => {
      const res = await fetch(`/api/students/next-code?type=${encodeURIComponent(qForm.type)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: isQuickOpen,
  });

  useEffect(() => {
    if (isQuickOpen) {
      refetchNextCode();
      setQForm(emptyQF());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isQuickOpen]);

  useEffect(() => {
    if (isQuickOpen && nextCodeData?.code) {
      setQForm(f => ({ ...f, code: nextCodeData.code, username: nextCodeData.code }));
    }
  }, [nextCodeData, isQuickOpen]);

  // Reset justAdded when dialog closes
  useEffect(() => {
    if (!open) setJustAdded([]);
  }, [open]);

  const handleQuickCreate = async () => {
    if (!qForm.fullName.trim()) {
      toast({ title: "Lỗi", description: "Vui lòng nhập Tên học viên", variant: "destructive" }); return;
    }
    if (!qForm.code.trim()) {
      toast({ title: "Lỗi", description: "Vui lòng nhập Mã", variant: "destructive" }); return;
    }
    if (!qForm.locationId) {
      toast({ title: "Lỗi", description: "Vui lòng chọn Cơ sở", variant: "destructive" }); return;
    }
    setQuickSaving(true);
    try {
      const res = await apiRequest("POST", "/api/students", {
        locationIds: [qForm.locationId],
        type: qForm.type,
        code: qForm.code.trim(),
        fullName: qForm.fullName.trim(),
        username: qForm.username.trim() || qForm.code.trim(),
        password: qForm.password || "123456",
        dateOfBirth: qForm.dateOfBirth || null,
        phone: qForm.phone || "",
        email: qForm.email || null,
        parentName: qForm.parentName || "",
        parentPhone: qForm.parentPhone || "",
      });
      const created = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/students"] });
      if (classId) queryClient.invalidateQueries({ queryKey: [`/api/classes/${classId}/available-students`] });
      const candidate = { id: created.id, fullName: created.fullName, code: created.code, source: "new" };
      setJustAdded(prev => [candidate, ...prev]);
      onSelectionChange([created.id, ...selectedIds]);
      setIsQuickOpen(false);
      toast({ title: "Đã tạo", description: `"${created.fullName}" đã thêm vào danh sách` });
    } catch (err: any) {
      toast({ title: "Lỗi", description: err.message || "Không thể tạo học viên", variant: "destructive" });
    } finally {
      setQuickSaving(false);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
    onSelectionChange([]);
    onSearchChange("");
  };

  const handleConfirm = () => {
    const selectedFromList = allCandidates.filter((s) => selectedIds.includes(s.id));
    const selectedFromJustAdded = justAdded.filter((s) => selectedIds.includes(s.id) && !selectedFromList.some(x => x.id === s.id));
    const all = [...selectedFromList, ...selectedFromJustAdded];
    const formatted = all.map((s) => ({
      studentId: s.id,
      fullName: s.fullName,
      code: s.code,
      source: s.source,
    }));
    onConfirm(formatted);
    onOpenChange(false);
  };

  const allVisible = [...justAdded, ...filteredCandidates.filter(s => !justAdded.some(j => j.id === s.id))];
  const allChecked = selectedIds.length === allVisible.length && allVisible.length > 0;

  const handleToggleAll = (checked: boolean) => {
    if (checked) {
      onSelectionChange(allVisible.map((s) => s.id));
    } else {
      onSelectionChange([]);
    }
  };

  const handleToggleOne = (id: string, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedIds, id]);
    } else {
      onSelectionChange(selectedIds.filter((sid) => sid !== id));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="default"
          size="sm"
          className="h-7 px-2 text-[10px] flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white border-blue-600"
        >
          <UserPlus className="h-3 w-3" />
          Thêm học viên
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <DialogTitle>Thêm học viên vào buổi học</DialogTitle>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setIsQuickOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Thêm mới học viên
            </Button>
          </div>
        </DialogHeader>

        {/* Nested quick-add dialog */}
        <Dialog open={isQuickOpen} onOpenChange={setIsQuickOpen}>
          <DialogContent className="max-w-xl z-[200]">
            <DialogHeader><DialogTitle>Thêm mới học viên nhanh</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Cơ sở <span className="text-destructive">*</span></Label>
                  <Select value={qForm.locationId} onValueChange={v => setQF("locationId", v)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Chọn cơ sở..." /></SelectTrigger>
                    <SelectContent>
                      {(locationsList as any[]).map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Phân loại</Label>
                  <Select value={qForm.type} onValueChange={v => setQF("type", v)}>
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
                  <Input className="h-9 text-sm" value={qForm.code} onChange={e => setQF("code", e.target.value)} placeholder="VD: HV-01" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Tên <span className="text-destructive">*</span></Label>
                  <Input className="h-9 text-sm" value={qForm.fullName} onChange={e => setQF("fullName", e.target.value)} placeholder="Họ và tên..." />
                </div>
              </div>
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wide">Thông tin bổ sung</p>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Tài khoản</Label>
                    <Input className="h-9 text-sm" value={qForm.username} onChange={e => setQForm(f => ({ ...f, username: e.target.value }))} placeholder="Tự sinh theo Mã" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Mật khẩu</Label>
                    <Input className="h-9 text-sm" value={qForm.password} onChange={e => setQF("password", e.target.value)} placeholder="123456" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Sinh nhật</Label>
                    <Input type="date" className="h-9 text-sm" value={qForm.dateOfBirth} onChange={e => setQF("dateOfBirth", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Số điện thoại</Label>
                    <Input className="h-9 text-sm" value={qForm.phone} onChange={e => setQF("phone", e.target.value)} placeholder="SĐT..." />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Email</Label>
                    <Input className="h-9 text-sm" value={qForm.email} onChange={e => setQF("email", e.target.value)} placeholder="Email..." />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Họ tên Phụ huynh 1</Label>
                    <Input className="h-9 text-sm" value={qForm.parentName} onChange={e => setQF("parentName", e.target.value)} placeholder="Tên phụ huynh..." />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">SĐT Phụ huynh 1</Label>
                    <Input className="h-9 text-sm" value={qForm.parentPhone} onChange={e => setQF("parentPhone", e.target.value)} placeholder="SĐT phụ huynh..." />
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsQuickOpen(false)} disabled={quickSaving}>Hủy</Button>
              <Button onClick={handleQuickCreate} disabled={quickSaving}>
                {quickSaving ? "Đang lưu..." : "Lưu & thêm vào danh sách"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="space-y-4 py-4">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Tìm theo tên / mã học viên..."
              className="pl-8"
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
          <div className="rounded-lg border max-h-80 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={allChecked}
                      onCheckedChange={(checked) => handleToggleAll(!!checked)}
                    />
                  </TableHead>
                  <TableHead>Tên</TableHead>
                  <TableHead>Mã</TableHead>
                  <TableHead>Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Newly created students shown first with highlight */}
                {justAdded.map((student: any) => (
                  <TableRow key={student.id} className="bg-primary/5">
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(student.id)}
                        onCheckedChange={(checked) => handleToggleOne(student.id, !!checked)}
                      />
                    </TableCell>
                    <TableCell className="font-medium text-primary">{student.fullName}</TableCell>
                    <TableCell className="text-primary">{student.code}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                        Mới tạo
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredCandidates.filter(s => !justAdded.some(j => j.id === s.id)).length > 0 ? (
                  filteredCandidates.filter(s => !justAdded.some(j => j.id === s.id)).map((student: any) => {
                    const isInactive = student.accountStatus === "Không hoạt động";
                    return (
                      <TableRow key={student.id} className={isInactive ? "opacity-50" : ""}>
                        <TableCell>
                          <Checkbox
                            disabled={isInactive}
                            checked={selectedIds.includes(student.id)}
                            onCheckedChange={(checked) =>
                              handleToggleOne(student.id, !!checked)
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <span className={isInactive ? "text-muted-foreground" : ""}>{student.fullName}</span>
                        </TableCell>
                        <TableCell>
                          <span className={isInactive ? "text-muted-foreground" : ""}>{student.code}</span>
                        </TableCell>
                        <TableCell>
                          {isInactive ? (
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                              Không hoạt động
                            </span>
                          ) : student.source === "enrolled" ? (
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                              Đã trong lớp
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                              Chưa vào lớp
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : isLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      Đang tải...
                    </TableCell>
                  </TableRow>
                ) : justAdded.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      Không có học viên nào để thêm
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={handleCancel}>
            Hủy
          </Button>
          <Button disabled={selectedIds.length === 0} onClick={handleConfirm}>
            {`Thêm vào buổi (${selectedIds.length})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
