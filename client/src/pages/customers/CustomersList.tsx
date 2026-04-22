import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import type { StudentResponse, Location, CrmCustomerSource, CrmRejectReason } from "@shared/schema";
import { z } from "zod";
import { api } from "@shared/routes";
import { useStudents, useStudent, useCreateStudent, useDeleteStudent, useUpdateStudent } from "@/hooks/use-students";
import { useLocations } from "@/hooks/use-locations";
import { useStaff } from "@/hooks/use-staff";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { useCrmRelationships, useCrmCustomerSources, useCrmRejectReasons, type CrmRelationship } from "@/hooks/use-crm-config";
import { useStudentSchedule } from "@/hooks/useStudentSchedule";
import { useCustomersBulkActions } from "@/hooks/useCustomersBulkActions";
import { useExcelImportExport } from "@/hooks/useExcelImportExport";
import { AssignClassNewDialog } from "@/components/education/AssignClassNewDialog";
import { CustomerForm } from "./CustomerForm";
import { StudentDetailDialog } from "./StudentDetailDialog";
import { SearchableMultiSelect } from "@/components/customers/SearchableMultiSelect";
import { SortableColumnItem, type ColumnConfig } from "@/components/customers/SortableColumnItem";
import { ImportExcelDialog } from "@/components/customers/ImportExcelDialog";
import { BulkActionDialogs } from "@/components/customers/BulkActionDialogs";
import { CustomersTable } from "@/components/customers/CustomersTable";
import { CustomerActivityLogDialog } from "@/components/customers/CustomerActivityLogDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Filter, Settings2, GripVertical, Download, Upload, ChevronLeft, ChevronRight, Users, Building2, UserCog, GraduationCap, UserCircle, Tablet, BookOpen, Trash, ChevronDown, UserPlus, ScrollText } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ScheduleDialog } from "@/components/education/ScheduleDialog";
import { CreateInvoiceDialog } from "@/pages/finance/CreateInvoiceDialog";

const INITIAL_COLUMNS: ColumnConfig[] = [
  { id: "selection", label: "Tickbox", visible: true, fixed: "left" },
  { id: "code", label: "Mã", visible: true, fixed: "left" },
  { id: "fullName", label: "Họ và tên", visible: true, fixed: "left" },
  { id: "location", label: "Cơ sở", visible: true, fixed: "left" },
  { id: "type", label: "Phân loại", visible: true },
  { id: "phone", label: "SĐT", visible: true },
  { id: "dob", label: "Ngày sinh", visible: true },
  { id: "email", label: "Email", visible: true },
  { id: "parent1", label: "PH 1", visible: true },
  { id: "phone1", label: "SĐT PH 1", visible: true },
  { id: "parent2", label: "PH 2", visible: true },
  { id: "phone2", label: "SĐT PH 2", visible: true },
  { id: "parent3", label: "PH 3", visible: true },
  { id: "phone3", label: "SĐT PH 3", visible: true },
  { id: "parentAccounts", label: "Mã Phụ huynh", visible: true },
  { id: "pipeline", label: "Mối quan hệ", visible: true },
  { id: "source", label: "Nguồn", visible: true },
  { id: "reject", label: "Lý do từ chối", visible: true },
  { id: "sale", label: "Sale", visible: true },
  { id: "manager", label: "Quản lý", visible: true },
  { id: "teacher", label: "Giáo viên", visible: true },
  { id: "classes", label: "Lớp học", visible: true },
  { id: "accountStatus", label: "Trạng thái tài khoản", visible: true },
  { id: "learningStatus", label: "Trạng thái học viên", visible: true },
  { id: "address", label: "Địa chỉ", visible: true },
  { id: "social", label: "Zalo/FB", visible: true },
  { id: "level", label: "Trình độ", visible: true },
  { id: "note", label: "Ghi chú", visible: true },
  { id: "createdAt", label: "Ngày tạo", visible: true },
  { id: "creator", label: "Người tạo", visible: true },
  { id: "updatedAt", label: "Ngày cập nhật", visible: true },
  { id: "updater", label: "Người cập nhật", visible: true },
  { id: "actions", label: "Thao tác", visible: true, fixed: "right" },
];

export function CustomersList() {
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState({
    locationId: "all",
    type: "all",
    pipelineStage: "all",
    sources: [] as string[],
    rejectReasons: [] as string[],
    saleIds: [] as string[],
    managerIds: [] as string[],
    teacherIds: [] as string[],
    classIds: [] as string[],
    dateFrom: "",
    dateTo: "",
  });

  const { data: studentsData, isLoading } = useStudents({
    limit: pageSize,
    offset: (currentPage - 1) * pageSize,
    searchTerm,
    locationId: filters.locationId,
    type: filters.type,
    pipelineStage: filters.pipelineStage,
    sources: filters.sources.length > 0 ? filters.sources : undefined,
    rejectReasons: filters.rejectReasons.length > 0 ? filters.rejectReasons : undefined,
    salesIds: filters.saleIds.length > 0 ? filters.saleIds : undefined,
    managerIds: filters.managerIds.length > 0 ? filters.managerIds : undefined,
    teacherIds: filters.teacherIds.length > 0 ? filters.teacherIds : undefined,
    classIds: filters.classIds.length > 0 ? filters.classIds : undefined,
    startDate: filters.dateFrom || undefined,
    endDate: filters.dateTo || undefined,
  });

  const students = studentsData?.students || [];
  const totalItems = studentsData?.total || 0;
  const totalPages = Math.ceil(totalItems / pageSize);

  const studentIds = students.map((s) => s.id);
  const { data: learningStatuses } = useQuery<Record<string, string>>({
    queryKey: ["/api/students/learning-statuses", studentIds],
    queryFn: () =>
      studentIds.length === 0
        ? Promise.resolve({})
        : fetch(`/api/students/learning-statuses?ids=${studentIds.join(",")}`, { credentials: "include" }).then((r) => r.json()),
    enabled: studentIds.length > 0,
  });

  const { data: parentsData } = useStudents({ type: "Phụ huynh", limit: 1000 });

  const { data: myPerms } = useMyPermissions();
  const rawCrmPerms = myPerms?.permissions?.["/customers"];
  const crmPerms = myPerms?.isSuperAdmin
    ? { canView: true, canViewAll: true, canCreate: true, canEdit: true, canDelete: true }
    : {
        canView: rawCrmPerms?.canView ?? false,
        canViewAll: rawCrmPerms?.canViewAll ?? false,
        canCreate: rawCrmPerms?.canCreate ?? false,
        canEdit: rawCrmPerms?.canEdit ?? false,
        canDelete: rawCrmPerms?.canDelete ?? false,
      };

  const createStudent = useCreateStudent();
  const updateStudent = useUpdateStudent();
  const deleteStudent = useDeleteStudent();
  const { toast } = useToast();

  const [isActivityLogOpen, setIsActivityLogOpen] = useState(false);
  const [isCreateInvoiceOpen, setIsCreateInvoiceOpen] = useState(false);
  const [invoiceTargetStudent, setInvoiceTargetStudent] = useState<{ id: string; fullName: string; code: string } | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<StudentResponse | null>(null);

  const { data: freshEditingStudent } = useStudent(editingStudent?.id || "");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [selectedStudentDetail, setSelectedStudentDetail] = useState<StudentResponse | null>(null);
  const [columns, setColumns] = useState<ColumnConfig[]>(() => {
    try {
      const saved = localStorage.getItem("customers-columns");
      if (saved) {
        const parsed = JSON.parse(saved) as ColumnConfig[];
        const savedIds = new Set(parsed.map((c) => c.id));
        const newCols = INITIAL_COLUMNS.filter((c) => !savedIds.has(c.id));
        return [...parsed, ...newCols];
      }
    } catch {}
    return INITIAL_COLUMNS;
  });

  const { data: crmRelationships } = useCrmRelationships();
  const { data: crmSources } = useCrmCustomerSources();
  const { data: crmReasons } = useCrmRejectReasons();
  const { data: locations } = useLocations();
  const { data: staff } = useStaff(undefined, true);

  const sortedRelationships = useMemo(() => {
    if (!crmRelationships) return [];
    return [...crmRelationships].sort((a, b) => parseInt(a.position || "0") - parseInt(b.position || "0"));
  }, [crmRelationships]);

  type StaffMember = { id: string; fullName: string; position?: string };
  const typedStaff = useMemo(() => (staff as StaffMember[] | undefined) ?? [], [staff]);
  const sales = useMemo(() => typedStaff.filter((s) => s.position?.toLowerCase().includes("sale")) || typedStaff, [typedStaff]);
  const managers = useMemo(() => typedStaff.filter((s) => s.position?.toLowerCase().includes("quản lý") || s.position?.toLowerCase().includes("manager")) || typedStaff, [typedStaff]);
  const teachers = useMemo(() => typedStaff.filter((s) => s.position?.toLowerCase().includes("giáo viên") || s.position?.toLowerCase().includes("teacher")) || typedStaff, [typedStaff]);
  const parents = useMemo(() => parentsData?.students || [], [parentsData]);
  const { data: classesRaw = [] } = useQuery<{ id: string; name: string; classCode?: string }[]>({
    queryKey: ["/api/classes", { minimal: true }],
    queryFn: async () => {
      const res = await fetch("/api/classes?minimal=true", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
  const classes = useMemo(
    () => classesRaw.map((c) => ({ id: c.id, name: c.name || c.classCode || c.id })),
    [classesRaw]
  );

  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(searchInput), 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    try {
      localStorage.setItem("customers-columns", JSON.stringify(columns));
    } catch {}
  }, [columns]);

  const visibleColumns = useMemo(() => columns.filter((c) => c.visible), [columns]);

  useEffect(() => {
    setIsActionMenuOpen(selectedIds.length > 0);
  }, [selectedIds]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filters, pageSize]);

  const schedule = useStudentSchedule();

  const bulk = useCustomersBulkActions({
    students,
    updateStudent,
    deleteStudent,
    setSelectedIds,
    parents,
  });

  const excel = useExcelImportExport({
    students,
    staff: staff || [],
    locations: locations || [],
    sortedRelationships,
    crmSources: crmSources || [],
    crmReasons: crmReasons || [],
    createStudent,
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setColumns((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const toggleColumn = (id: string) =>
    setColumns((prev) => prev.map((col) => (col.id === id ? { ...col, visible: !col.visible } : col)));

  const toggleSelectAll = () => {
    setSelectedIds(selectedIds.length === students.length ? [] : students.map((s) => s.id));
  };

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));

  const handleCreate = (data: z.infer<typeof api.students.create.input>) => {
    createStudent.mutate(data, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/customers/activity-logs"] });
        setIsAddOpen(false);
        toast({ title: "Thành công", description: "Đã thêm học viên mới." });
      },
    });
  };

  const handleUpdate = (data: z.infer<typeof api.students.update.input>) => {
    if (!editingStudent) return;
    const cleanedData = { ...data };
    if (cleanedData.classId === "") delete cleanedData.classId;
    updateStudent.mutate(
      { id: editingStudent.id, ...cleanedData },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/customers/activity-logs"] });
          setIsEditOpen(false);
          setEditingStudent(null);
          toast({ title: "Thành công", description: "Đã cập nhật thông tin học viên." });
        },
        onError: () => {
          toast({ title: "Lỗi", description: "Không thể cập nhật thông tin học viên.", variant: "destructive" });
        },
      }
    );
  };

  const handleDelete = (id: string) => {
    if (confirm("Bạn có chắc chắn muốn xoá học viên này?")) {
      deleteStudent.mutate(id, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/customers/activity-logs"] });
          toast({ title: "Thành công", description: "Đã xoá học viên." });
        },
      });
    }
  };

  const hasActiveFilters =
    filters.locationId !== "all" ||
    filters.type !== "all" ||
    filters.pipelineStage !== "all" ||
    filters.sources.length > 0 ||
    filters.rejectReasons.length > 0 ||
    filters.saleIds.length > 0 ||
    filters.managerIds.length > 0 ||
    filters.teacherIds.length > 0 ||
    filters.classIds.length > 0 ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "";

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full gap-3">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 flex-shrink-0">
          <div className="w-full sm:w-auto">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setFilters((f) => ({ ...f, pipelineStage: "all" }))}
                className={cn(
                  "px-3 py-1 rounded-md border text-xs font-medium transition-all",
                  filters.pipelineStage === "all"
                    ? "bg-cyan-400 border-cyan-400 text-white shadow-sm"
                    : "bg-white border-violet-300 text-violet-700 hover:border-cyan-400 hover:text-cyan-600"
                )}
                data-testid="filter-btn-all"
              >
                Tất cả
              </button>
              {sortedRelationships.map((rel: CrmRelationship) => {
                const isActive = filters.pipelineStage === rel.name;
                const color = rel.color || "#8b5cf6";
                return (
                  <button
                    key={rel.id}
                    onClick={() => setFilters((f) => ({ ...f, pipelineStage: rel.name }))}
                    style={isActive ? { backgroundColor: color, borderColor: color } : { borderColor: color, color }}
                    className={cn(
                      "px-3 py-1 rounded-md border text-xs font-medium transition-all",
                      isActive ? "text-white shadow-sm" : "bg-white hover:opacity-80"
                    )}
                    data-testid={`filter-btn-${rel.name}`}
                  >
                    {rel.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="bg-card border border-border shadow-sm rounded-2xl flex flex-col flex-1 overflow-hidden min-h-0">
          <div className="px-4 py-3 border-b border-border/50 flex flex-col md:flex-row gap-3 items-center justify-between bg-muted/10 flex-shrink-0">
            <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Tìm kiếm theo Tên, Mã HV..."
                  className="pl-9 h-9 bg-white"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  data-testid="input-search-customers"
                />
              </div>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "px-3 py-1 rounded-md border text-xs font-medium transition-all flex items-center gap-2 bg-white border-border shadow-sm",
                      hasActiveFilters && "border-primary text-primary bg-primary/5"
                    )}
                  >
                    <Filter className="w-3.5 h-3.5" /> Bộ lọc
                    {hasActiveFilters && (
                      <Badge variant="default" className="ml-1 h-4 w-4 p-0 flex items-center justify-center rounded-full text-[10px]">!</Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[600px] p-4 bg-background border shadow-xl" align="end">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-sm">Bộ lọc nâng cao</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-muted-foreground"
                      onClick={() => setFilters({ locationId: "all", type: "all", pipelineStage: filters.pipelineStage, sources: [], rejectReasons: [], saleIds: [], managerIds: [], teacherIds: [], classIds: [], dateFrom: "", dateTo: "" })}
                    >
                      Xoá tất cả
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs">Cơ sở</Label>
                      <Select value={filters.locationId} onValueChange={(v) => setFilters((f) => ({ ...f, locationId: v }))}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Tất cả cơ sở" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tất cả cơ sở</SelectItem>
                          {locations?.map((loc: Location) => <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Phân loại</Label>
                      <Select value={filters.type} onValueChange={(v) => setFilters((f) => ({ ...f, type: v }))}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Tất cả phân loại" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tất cả phân loại</SelectItem>
                          <SelectItem value="Học viên">Học viên</SelectItem>
                          <SelectItem value="Phụ huynh">Phụ huynh</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Nguồn</Label>
                      <SearchableMultiSelect
                        placeholder="Chọn nguồn"
                        options={crmSources?.map((s: CrmCustomerSource) => ({ id: s.name, name: s.name })) || []}
                        selected={filters.sources}
                        onSelect={(val) => setFilters((f) => ({ ...f, sources: [...f.sources, val] }))}
                        onRemove={(val) => setFilters((f) => ({ ...f, sources: f.sources.filter((s) => s !== val) }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Lý do từ chối</Label>
                      <SearchableMultiSelect
                        placeholder="Chọn lý do"
                        options={crmReasons?.map((r: CrmRejectReason) => ({ id: r.reason, reason: r.reason })) || []}
                        selected={filters.rejectReasons}
                        onSelect={(val) => setFilters((f) => ({ ...f, rejectReasons: [...f.rejectReasons, val] }))}
                        onRemove={(val) => setFilters((f) => ({ ...f, rejectReasons: f.rejectReasons.filter((r) => r !== val) }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Sale</Label>
                      <SearchableMultiSelect
                        placeholder="Chọn sale"
                        options={sales.map((s) => ({ id: s.id, fullName: s.fullName }))}
                        selected={filters.saleIds}
                        onSelect={(val) => setFilters((f) => ({ ...f, saleIds: [...f.saleIds, val] }))}
                        onRemove={(val) => setFilters((f) => ({ ...f, saleIds: f.saleIds.filter((id) => id !== val) }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Quản lý</Label>
                      <SearchableMultiSelect
                        placeholder="Chọn quản lý"
                        options={managers.map((s) => ({ id: s.id, fullName: s.fullName }))}
                        selected={filters.managerIds}
                        onSelect={(val) => setFilters((f) => ({ ...f, managerIds: [...f.managerIds, val] }))}
                        onRemove={(val) => setFilters((f) => ({ ...f, managerIds: f.managerIds.filter((id) => id !== val) }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Giáo Viên</Label>
                      <SearchableMultiSelect
                        placeholder="Chọn giáo viên"
                        options={teachers.map((s) => ({ id: s.id, fullName: s.fullName }))}
                        selected={filters.teacherIds}
                        onSelect={(val) => setFilters((f) => ({ ...f, teacherIds: [...f.teacherIds, val] }))}
                        onRemove={(val) => setFilters((f) => ({ ...f, teacherIds: f.teacherIds.filter((id) => id !== val) }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Lớp</Label>
                      <SearchableMultiSelect
                        placeholder="Chọn lớp"
                        options={classes}
                        selected={filters.classIds}
                        onSelect={(val) => setFilters((f) => ({ ...f, classIds: [...f.classIds, val] }))}
                        onRemove={(val) => setFilters((f) => ({ ...f, classIds: f.classIds.filter((id) => id !== val) }))}
                      />
                    </div>
                    <div className="col-span-1 grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px]">Ngày tạo từ</Label>
                        <Input type="date" className="h-8 text-xs" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">Đến</Label>
                        <Input type="date" className="h-8 text-xs" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} />
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              {crmPerms.canCreate && (
                <Button variant="outline" size="sm" onClick={() => setIsImportOpen(true)} className="px-3 py-1 rounded-md border text-xs font-medium transition-all flex items-center gap-2 bg-white border-border shadow-sm">
                  <Upload className="w-3.5 h-3.5" /><span>Tải lên</span>
                </Button>
              )}
              {crmPerms.canEdit && (
                <Button variant="outline" size="sm" onClick={excel.exportToExcel} className="px-3 py-1 rounded-md border text-xs font-medium transition-all flex items-center gap-2 bg-white border-border shadow-sm">
                  <Download className="w-3.5 h-3.5" /><span>Tải xuống</span>
                </Button>
              )}
              {crmPerms.canEdit && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="px-3 py-1 rounded-md border text-xs font-medium transition-all flex items-center gap-2 bg-white border-border shadow-sm">
                      <Settings2 className="w-3.5 h-3.5" /><span>Sắp xếp</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-4" align="end">
                    <h3 className="font-semibold mb-4 text-sm px-1">Cấu hình cột hiển thị</h3>
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                      <SortableContext items={columns.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                        <div className="max-h-[400px] overflow-y-auto pr-1">
                          {columns.map((column) => (
                            <SortableColumnItem key={column.id} column={column} onToggle={toggleColumn} />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </PopoverContent>
                </Popover>
              )}
              {crmPerms.canCreate && (
                <Button onClick={() => setIsAddOpen(true)} size="sm" className="px-3 py-1 rounded-md border text-xs font-medium transition-all flex items-center gap-2 bg-primary hover:bg-primary/90 text-white border-primary shadow-sm">
                  <Plus className="w-3.5 h-3.5" /><span>Thêm Học Viên</span>
                </Button>
              )}
              {crmPerms.canEdit && (
                <DropdownMenu open={isActionMenuOpen} onOpenChange={setIsActionMenuOpen} modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="px-3 py-1 rounded-md border text-xs font-medium transition-all flex items-center gap-2 bg-white border-border shadow-sm">
                      <span>Hành động ({selectedIds.length})</span>
                      <ChevronDown className="w-3.5 h-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-56 p-2 rounded-xl bg-white opacity-100 shadow-xl border-border"
                    onPointerDownOutside={(e) => {
                      const target = e.target as HTMLElement;
                      if (target.closest('[role="checkbox"]') || target.closest("[data-radix-collection-item]")) e.preventDefault();
                    }}
                    onInteractOutside={(e) => {
                      const target = e.target as HTMLElement;
                      if (target.closest('[role="checkbox"]') || target.closest("[data-radix-collection-item]")) e.preventDefault();
                    }}
                  >
                    {selectedIds.length > 0 ? (
                      <>
                        <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground border-b mb-1">Thao tác hàng loạt</div>
                        <DropdownMenuItem className="flex items-center gap-3 py-2 cursor-pointer rounded-lg hover:bg-accent" onClick={() => bulk.setIsBulkRelOpen(true)}>
                          <Users className="w-4 h-4 text-pink-500" /><span>Mối quan hệ</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem className="flex items-center gap-3 py-2 cursor-pointer rounded-lg hover:bg-accent" onClick={() => bulk.setIsBulkLocationOpen(true)}>
                          <Building2 className="w-4 h-4 text-blue-600" /><span>Gán cơ sở</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem className="flex items-center gap-3 py-2 cursor-pointer rounded-lg hover:bg-accent" onClick={() => bulk.setIsBulkSaleOpen(true)}>
                          <UserCog className="w-4 h-4 text-orange-500" /><span>Gán sale</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem className="flex items-center gap-3 py-2 cursor-pointer rounded-lg hover:bg-accent" onClick={() => bulk.setIsBulkManagerOpen(true)}>
                          <UserPlus className="w-4 h-4 text-green-500" /><span>Gán quản lý</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem className="flex items-center gap-3 py-2 cursor-pointer rounded-lg hover:bg-accent" onClick={() => bulk.setIsBulkTeacherOpen(true)}>
                          <GraduationCap className="w-4 h-4 text-purple-600" /><span>Gán giáo viên</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem className="flex items-center gap-3 py-2 cursor-pointer rounded-lg hover:bg-accent" onClick={() => bulk.setIsBulkParentOpen(true)}>
                          <UserCircle className="w-4 h-4 text-teal-500" /><span>Gán phụ huynh</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem className="flex items-center gap-3 py-2 cursor-pointer rounded-lg hover:bg-accent" onClick={() => bulk.setIsAssignClassOpen(true)}>
                          <BookOpen className="w-4 h-4 text-blue-500" /><span>Gán lớp</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem className="flex items-center gap-3 py-2 cursor-pointer rounded-lg hover:bg-accent" onClick={(e) => { e.preventDefault(); bulk.setIsAccountStatusOpen(true); setIsActionMenuOpen(false); }}>
                          <Tablet className="w-4 h-4 text-indigo-600" /><span>TT Tài khoản</span>
                        </DropdownMenuItem>
                        {crmPerms.canDelete && (
                          <>
                            <div className="my-1 border-t" />
                            <DropdownMenuItem
                              className="flex items-center gap-3 py-2 cursor-pointer rounded-lg text-destructive focus:text-destructive focus:bg-destructive/10"
                              onClick={() => bulk.handleBulkDelete(selectedIds)}
                            >
                              <Trash className="w-4 h-4" /><span>Xoá {selectedIds.length} học viên</span>
                            </DropdownMenuItem>
                          </>
                        )}
                      </>
                    ) : (
                      <div className="px-4 py-2 text-xs text-muted-foreground text-center">Vui lòng chọn học viên để thực hiện hành động</div>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Button
                variant="outline"
                size="sm"
                className="px-3 py-1 rounded-md border text-xs font-medium transition-all flex items-center gap-2 bg-white border-border shadow-sm ml-auto"
                onClick={() => setIsActivityLogOpen(true)}
                data-testid="btn-nhat-ky"
              >
                <ScrollText className="w-3.5 h-3.5" />
                <span>Nhật ký</span>
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            <CustomersTable
              students={students}
              isLoading={isLoading}
              visibleColumns={visibleColumns}
              selectedIds={selectedIds}
              crmRelationships={crmRelationships}
              parents={parents}
              learningStatuses={learningStatuses}
              toggleSelectAll={toggleSelectAll}
              toggleSelect={toggleSelect}
              onEdit={(student) => { setEditingStudent(student); setIsEditOpen(true); }}
              onDelete={handleDelete}
              onCreateInvoice={(student) => {
                setInvoiceTargetStudent({ id: student.id, fullName: student.fullName, code: student.code ?? "" });
                setIsCreateInvoiceOpen(true);
              }}
              onViewDetail={setSelectedStudentDetail}
              canEdit={crmPerms.canEdit}
              canDelete={crmPerms.canDelete}
            />
          </div>

          <div className="p-4 border-t border-border/50 text-sm text-muted-foreground flex flex-col sm:flex-row justify-between items-center gap-4 bg-muted/5">
            <div className="flex items-center gap-4">
              <span>Hiển thị {students.length} / {totalItems} kết quả</span>
              <div className="flex items-center gap-2">
                <span className="text-xs">Số hàng:</span>
                <Select value={pageSize.toString()} onValueChange={(v) => setPageSize(parseInt(v))}>
                  <SelectTrigger className="h-8 w-[70px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="30">30</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1 || isLoading} className="h-8 gap-1">
                <ChevronLeft className="w-4 h-4" /> Trước
              </Button>
              <div className="flex items-center gap-1 text-xs">
                <span className="font-medium text-foreground">{currentPage}</span>
                <span>/</span>
                <span>{totalPages || 1}</span>
              </div>
              <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || totalPages === 0 || isLoading} className="h-8 gap-1">
                Sau <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ImportExcelDialog
        isOpen={isImportOpen}
        onOpenChange={setIsImportOpen}
        locations={locations}
        isImporting={excel.isImporting}
        uploadProgress={excel.uploadProgress}
        onImport={excel.handleImport}
        onDownloadSample={excel.downloadSample}
      />

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-none w-screen h-screen m-0 p-0 overflow-hidden bg-background border-none shadow-2xl rounded-none">
          <div className="px-6 py-4 border-b border-border/50 bg-card flex justify-between items-center">
            <div>
              <DialogTitle className="text-2xl font-display">Thêm Học Viên Mới</DialogTitle>
              <DialogDescription>Điền đầy đủ thông tin bên dưới để tạo hồ sơ học viên mới.</DialogDescription>
            </div>
            <Button variant="ghost" onClick={() => setIsAddOpen(false)} className="h-10 w-10 p-0 rounded-full">
              <span className="sr-only">Close</span>
              <Plus className="h-6 w-6 rotate-45" />
            </Button>
          </div>
          <div className="h-[calc(100vh-80px)] overflow-y-auto p-6 scroll-smooth">
            <div className="max-w-7xl mx-auto">
              <CustomerForm onSubmit={handleCreate} isPending={createStudent.isPending} />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) setEditingStudent(null); }}>
        <DialogContent className="max-w-none w-screen h-screen m-0 p-0 overflow-hidden bg-background border-none shadow-2xl rounded-none">
          <div className="px-6 py-4 border-b border-border/50 bg-card flex justify-between items-center">
            <div>
              <DialogTitle className="text-2xl font-display">Chỉnh Sửa Học Viên</DialogTitle>
              <DialogDescription>Cập nhật thông tin hồ sơ học viên.</DialogDescription>
            </div>
            <Button variant="ghost" onClick={() => setIsEditOpen(false)} className="h-10 w-10 p-0 rounded-full">
              <span className="sr-only">Close</span>
              <Plus className="h-6 w-6 rotate-45" />
            </Button>
          </div>
          <div className="h-[calc(100vh-80px)] overflow-y-auto p-6 scroll-smooth">
            <div className="max-w-7xl mx-auto">
              <CustomerForm initialData={(freshEditingStudent as any) || editingStudent} onSubmit={handleUpdate} isPending={updateStudent.isPending} />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AssignClassNewDialog
        isOpen={bulk.isAssignClassOpen}
        onOpenChange={bulk.setIsAssignClassOpen}
        studentIds={selectedIds}
        students={students.filter((s) => selectedIds.includes(s.id)).map((s) => ({ id: s.id, fullName: s.fullName }))}
        studentCount={selectedIds.length}
        locationId={filters.locationId}
      />

      {schedule.isScheduleOpen && schedule.studentForSchedule && (
        <ScheduleDialog
          isOpen={schedule.isScheduleOpen}
          onOpenChange={schedule.setIsScheduleOpen}
          students={[{
            ...schedule.studentForSchedule,
            studentId: schedule.studentForSchedule.id,
          }]}
          classData={schedule.scheduleClassData}
          classSessions={schedule.scheduleSessionsData}
          onConfirm={schedule.handleScheduleConfirm}
          isPending={schedule.isLoadingSchedule}
        />
      )}

      <CreateInvoiceDialog
        open={isCreateInvoiceOpen}
        onClose={() => { setIsCreateInvoiceOpen(false); setInvoiceTargetStudent(null); }}
        defaultStudent={invoiceTargetStudent}
      />

      <BulkActionDialogs
        selectedIds={selectedIds}
        students={students}
        staff={staff || []}
        parents={parents}
        locations={locations || []}
        sortedRelationships={sortedRelationships}
        updateStudent={updateStudent}
        {...bulk}
      />

      <StudentDetailDialog
        open={!!selectedStudentDetail}
        onOpenChange={(open) => { if (!open) setSelectedStudentDetail(null); }}
        student={selectedStudentDetail}
      />

      <CustomerActivityLogDialog
        open={isActivityLogOpen}
        onOpenChange={setIsActivityLogOpen}
      />
    </DashboardLayout>
  );
}
