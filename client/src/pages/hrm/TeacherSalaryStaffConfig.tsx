import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Trash2, Users, BookOpen, Package, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { Course } from "@shared/schema";
import type { TeacherSalaryPackage } from "@/hooks/use-teacher-salary-packages";
import { Badge } from "@/components/ui/badge";

interface StaffItem {
  id: string;
  fullName: string;
  code: string;
  status: string;
}

interface StaffSalaryConfig {
  id: string;
  staffId: string;
  courseId: string;
  salaryPackageId: string;
  createdAt: string;
  courseName: string | null;
  salaryPackageName: string | null;
}

interface ConfigRow {
  courseId: string;
  salaryPackageId: string;
}

type DialogMode = "add" | "edit";

export function TeacherSalaryStaffConfig() {
  const { toast } = useToast();
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>("add");
  const [editingConfig, setEditingConfig] = useState<StaffSalaryConfig | null>(null);
  const [rows, setRows] = useState<ConfigRow[]>([{ courseId: "", salaryPackageId: "" }]);

  const { data: staffList = [], isLoading: staffLoading } = useQuery<StaffItem[]>({
    queryKey: ["/api/staff/training-department"],
  });

  const { data: courses = [], isLoading: coursesLoading } = useQuery<Course[]>({
    queryKey: ["/api/courses"],
  });

  const { data: packages = [], isLoading: packagesLoading } = useQuery<TeacherSalaryPackage[]>({
    queryKey: ["/api/teacher-salary-packages"],
  });

  const { data: configs = [], isLoading: configsLoading } = useQuery<StaffSalaryConfig[]>({
    queryKey: ["/api/staff-salary-configs", selectedStaffId],
    queryFn: async () => {
      if (!selectedStaffId) return [];
      const res = await fetch(`/api/staff-salary-configs?staffId=${selectedStaffId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch configs");
      return res.json();
    },
    enabled: !!selectedStaffId,
  });

  useEffect(() => {
    if (staffList.length > 0 && !selectedStaffId) {
      setSelectedStaffId(staffList[0].id);
    }
  }, [staffList, selectedStaffId]);

  const createMutation = useMutation({
    mutationFn: async (data: { staffId: string; courseId: string; salaryPackageId: string }) => {
      return apiRequest("POST", "/api/staff-salary-configs", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-salary-configs", selectedStaffId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, courseId, salaryPackageId }: { id: string; courseId: string; salaryPackageId: string }) => {
      return apiRequest("PATCH", `/api/staff-salary-configs/${id}`, { courseId, salaryPackageId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-salary-configs", selectedStaffId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/staff-salary-configs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff-salary-configs", selectedStaffId] });
    },
  });

  const selectedStaff = staffList.find(s => s.id === selectedStaffId);

  const handleOpenAdd = () => {
    setDialogMode("add");
    setEditingConfig(null);
    setRows([{ courseId: "", salaryPackageId: "" }]);
    setDialogOpen(true);
  };

  const handleOpenEdit = (config: StaffSalaryConfig) => {
    setDialogMode("edit");
    setEditingConfig(config);
    setRows([{ courseId: config.courseId, salaryPackageId: config.salaryPackageId }]);
    setDialogOpen(true);
  };

  const handleAddRow = () => {
    setRows(prev => [...prev, { courseId: "", salaryPackageId: "" }]);
  };

  const handleRemoveRow = (index: number) => {
    setRows(prev => prev.filter((_, i) => i !== index));
  };

  const handleRowChange = (index: number, field: keyof ConfigRow, value: string) => {
    setRows(prev => prev.map((row, i) => i === index ? { ...row, [field]: value } : row));
  };

  const handleSave = async () => {
    if (!selectedStaffId) return;

    if (dialogMode === "edit" && editingConfig) {
      const row = rows[0];
      if (!row.courseId || !row.salaryPackageId) {
        toast({ title: "Lỗi", description: "Vui lòng chọn khoá học và gói lương", variant: "destructive" });
        return;
      }
      try {
        await updateMutation.mutateAsync({ id: editingConfig.id, courseId: row.courseId, salaryPackageId: row.salaryPackageId });
        toast({ title: "Thành công", description: "Đã cập nhật cấu hình lương" });
        setDialogOpen(false);
      } catch (err: any) {
        toast({ title: "Lỗi", description: err.message || "Không thể cập nhật", variant: "destructive" });
      }
      return;
    }

    const valid = rows.filter(r => r.courseId && r.salaryPackageId);
    if (valid.length === 0) {
      toast({ title: "Lỗi", description: "Vui lòng chọn ít nhất một khoá học và gói lương", variant: "destructive" });
      return;
    }

    try {
      for (const row of valid) {
        await createMutation.mutateAsync({ staffId: selectedStaffId, courseId: row.courseId, salaryPackageId: row.salaryPackageId });
      }
      toast({ title: "Thành công", description: `Đã thêm ${valid.length} cấu hình lương` });
      setDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Lỗi", description: err.message || "Không thể lưu cấu hình", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Bạn có chắc muốn xoá cấu hình này?")) return;
    try {
      await deleteMutation.mutateAsync(id);
      toast({ title: "Thành công", description: "Đã xoá cấu hình" });
    } catch (err: any) {
      toast({ title: "Lỗi", description: err.message, variant: "destructive" });
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="flex h-full min-h-[500px] gap-0 border rounded-lg overflow-hidden bg-background">
      {/* Left sidebar - 40% */}
      <div className="w-[40%] border-r flex flex-col">
        <div className="p-3 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Nhân sự Phòng Đào tạo</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {staffLoading ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : staffList.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
              <Users className="h-8 w-8 opacity-30" />
              <p className="text-xs">Không có nhân sự</p>
            </div>
          ) : (
            <div className="divide-y">
              {staffList.map(s => (
                <button
                  key={s.id}
                  data-testid={`staff-item-${s.id}`}
                  onClick={() => setSelectedStaffId(s.id)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors flex flex-col gap-0.5",
                    selectedStaffId === s.id && "bg-primary/10 border-r-2 border-r-primary"
                  )}
                >
                  <span className="text-sm font-medium leading-tight">{s.fullName}</span>
                  <span className="text-[11px] text-muted-foreground">{s.code}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right panel - 60% */}
      <div className="flex-1 flex flex-col">
        {!selectedStaffId ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <Package className="h-10 w-10 opacity-30" />
            <p className="text-sm">Chọn nhân sự để xem cấu hình lương</p>
          </div>
        ) : (
          <>
            <div className="p-3 border-b bg-muted/30 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{selectedStaff?.fullName}</p>
                <p className="text-[11px] text-muted-foreground">{selectedStaff?.code}</p>
              </div>
              <Button size="sm" onClick={handleOpenAdd} data-testid="button-add-config">
                <Plus className="h-4 w-4 mr-1" />
                Thêm mới
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {configsLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : configs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
                  <BookOpen className="h-8 w-8 opacity-30" />
                  <p className="text-xs">Chưa có cấu hình lương nào</p>
                  <p className="text-xs">Nhấn "Thêm mới" để cấu hình</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {configs.map(config => (
                    <div
                      key={config.id}
                      data-testid={`config-row-${config.id}`}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card hover:shadow-sm transition-shadow"
                    >
                      <div className="flex flex-col gap-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs font-normal">
                            <BookOpen className="h-3 w-3 mr-1" />
                            {config.courseName || "—"}
                          </Badge>
                          <span className="text-muted-foreground text-xs">→</span>
                          <Badge variant="secondary" className="text-xs font-normal">
                            <Package className="h-3 w-3 mr-1" />
                            {config.salaryPackageName || "—"}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => handleOpenEdit(config)}
                          data-testid={`button-edit-config-${config.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDelete(config.id)}
                          data-testid={`button-delete-config-${config.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "edit" ? "Sửa cấu hình lương" : "Thêm cấu hình lương mặc định"}
            </DialogTitle>
            {selectedStaff && (
              <p className="text-sm text-muted-foreground">
                Nhân sự: <span className="font-medium text-foreground">{selectedStaff.fullName}</span>{" "}
                <span className="text-xs">({selectedStaff.code})</span>
              </p>
            )}
          </DialogHeader>

          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs text-muted-foreground px-1">
              <span>Khoá học</span>
              <span>Gói lương đứng lớp</span>
              <span />
            </div>
            {rows.map((row, index) => (
              <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                <Select
                  value={row.courseId}
                  onValueChange={val => handleRowChange(index, "courseId", val)}
                >
                  <SelectTrigger className="h-9 text-sm" data-testid={`select-course-${index}`}>
                    <SelectValue placeholder="Chọn khoá học" />
                  </SelectTrigger>
                  <SelectContent>
                    {coursesLoading ? (
                      <SelectItem value="loading" disabled>Đang tải...</SelectItem>
                    ) : courses.length === 0 ? (
                      <SelectItem value="empty" disabled>Không có khoá học</SelectItem>
                    ) : (
                      courses.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>

                <Select
                  value={row.salaryPackageId}
                  onValueChange={val => handleRowChange(index, "salaryPackageId", val)}
                >
                  <SelectTrigger className="h-9 text-sm" data-testid={`select-package-${index}`}>
                    <SelectValue placeholder="Chọn gói lương" />
                  </SelectTrigger>
                  <SelectContent>
                    {packagesLoading ? (
                      <SelectItem value="loading" disabled>Đang tải...</SelectItem>
                    ) : packages.length === 0 ? (
                      <SelectItem value="empty" disabled>Không có gói lương</SelectItem>
                    ) : (
                      packages.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>

                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => handleRemoveRow(index)}
                  disabled={rows.length === 1}
                  data-testid={`button-remove-row-${index}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}

            {dialogMode === "add" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full border-dashed"
                onClick={handleAddRow}
                data-testid="button-add-row"
              >
                <Plus className="h-4 w-4 mr-1" />
                Thêm dòng
              </Button>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Huỷ</Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              data-testid="button-save-configs"
            >
              {isSaving ? "Đang lưu..." : dialogMode === "edit" ? "Cập nhật" : "Lưu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
