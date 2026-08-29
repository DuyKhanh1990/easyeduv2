import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { useLanguage } from "@/hooks/use-language";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import type { StudentResponse, Location, CrmCustomerSource, CrmRejectReason, CrmSchool } from "@shared/schema";
import { z } from "zod";
import { api } from "@shared/routes";
import { useStudents, useStudent, useCreateStudent, useDeleteStudent, useUpdateStudent } from "@/hooks/use-students";
import { useLocations } from "@/hooks/use-locations";
import { useStaff } from "@/hooks/use-staff";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { useCrmRelationships, useCrmCustomerSources, useCrmRejectReasons, useCrmCustomFields, type CrmRelationship, type CrmPipelineGroup } from "@/hooks/use-crm-config";
import { makeCustomFieldKey } from "@/lib/crm-customer-fields";
import { useStudentSchedule } from "@/hooks/useStudentSchedule";
import { useCustomersBulkActions } from "@/hooks/useCustomersBulkActions";
import { useExcelImportExport } from "@/hooks/useExcelImportExport";
import { AssignClassNewDialog } from "@/components/education/AssignClassNewDialog";
import { CustomerForm } from "./CustomerForm";
import { StudentDetailDialog } from "./StudentDetailDialog";
import { ZaloCustomerChatPanel } from "@/components/customers/ZaloCustomerChatPanel";
import { SearchableMultiSelect } from "@/components/customers/SearchableMultiSelect";
import { SortableColumnItem, type ColumnConfig } from "@/components/customers/SortableColumnItem";
import { ImportExcelDialog } from "@/components/customers/ImportExcelDialog";
import { BulkActionDialogs } from "@/components/customers/BulkActionDialogs";
import { CustomersTable } from "@/components/customers/CustomersTable";
import { CustomerActivityLogDialog } from "@/components/customers/CustomerActivityLogDialog";
import { CustomerGuideDialog } from "@/components/customers/CustomerGuideDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Filter, Settings2, GripVertical, Download, Upload, ChevronLeft, ChevronRight, Users, Building2, UserCog, GraduationCap, UserCircle, Tablet, BookOpen, Trash, ChevronDown, UserPlus, ScrollText, UserCheck, SlidersHorizontal } from "lucide-react";
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
import { StoreDateRangePicker, DateRange } from "@/pages/store/StoreDateRangePicker";
import { format } from "date-fns";

const INITIAL_COLUMNS: ColumnConfig[] = [
  { id: "selection", label: "Tickbox", visible: true, fixed: "left" },
  { id: "code", label: "Mã", visible: true, fixed: "left" },
  { id: "fullName", label: "Họ và tên", visible: true, fixed: "left" },
  { id: "location", label: "Cơ sở", visible: true, fixed: "left" },
  { id: "school", label: "Trường học", visible: true },
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
  { id: "zaloOA", label: "Zalo OA", visible: true },
  { id: "level", label: "Trình độ", visible: true },
  { id: "note", label: "Ghi chú", visible: true },
  { id: "createdAt", label: "Ngày tạo", visible: true },
  { id: "creator", label: "Người tạo", visible: true },
  { id: "updatedAt", label: "Ngày cập nhật", visible: true },
  { id: "updater", label: "Người cập nhật", visible: true },
  { id: "appointmentNearest", label: "Lịch hẹn gần nhất", visible: true },
  { id: "appointment1", label: "Lịch hẹn 1", visible: true },
  { id: "appointment2", label: "Lịch hẹn 2", visible: true },
  { id: "lastContact", label: "Lần cuối tiếp cận", visible: true },
  { id: "discussion", label: "Thảo luận", visible: true },
  { id: "actions", label: "Thao tác", visible: true, fixed: "right" },
];

export function CustomersList() {
  type ViewMode = "relationship" | "class";
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "relationship";
    return new URLSearchParams(window.location.search).get("view") === "class" ? "class" : "relationship";
  });
  const [activeClassTab, setActiveClassTab] = useState<string>(() => {
    if (typeof window === "undefined") return "all";
    const params = new URLSearchParams(window.location.search);
    return params.get("classTab") === "unassigned" ? "unassigned" : params.get("classId") || "all";
  });
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
    schoolIds: [] as string[],
    birthYear: "",
    dateRange: {} as DateRange,
    updatedRange: {} as DateRange,
    accountStatuses: [] as string[],
    learningStatuses: [] as string[],
    birthdayFrom: "",
    birthdayTo: "",
  });

  const { data: classTabsData, isLoading: classTabsLoading } = useQuery<{
    classes: { id: string; name: string; classCode: string }[];
    hasUnassigned: boolean;
  }>({
    queryKey: ["/api/students/class-tabs"],
    queryFn: async () => {
      const res = await fetch("/api/students/class-tabs", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch class tabs");
      return res.json();
    },
    enabled: viewMode === "class",
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: studentsData, isLoading } = useStudents({
    limit: pageSize,
    offset: (currentPage - 1) * pageSize,
    searchTerm,
    locationId: filters.locationId,
    type: filters.type,
    pipelineStage: viewMode === "relationship" ? filters.pipelineStage : undefined,
    parentRelationshipId: viewMode === "relationship" && activeGroupId && filters.pipelineStage === "all" ? activeGroupId : undefined,
    sources: filters.sources.length > 0 ? filters.sources : undefined,
    rejectReasons: filters.rejectReasons.length > 0 ? filters.rejectReasons : undefined,
    salesIds: filters.saleIds.length > 0 ? filters.saleIds : undefined,
    managerIds: filters.managerIds.length > 0 ? filters.managerIds : undefined,
    teacherIds: filters.teacherIds.length > 0 ? filters.teacherIds : undefined,
    classIds: viewMode === "relationship" && filters.classIds.length > 0 ? filters.classIds : undefined,
    schoolIds: filters.schoolIds.length > 0 ? filters.schoolIds : undefined,
    birthYear: filters.birthYear || undefined,
    classTabId: viewMode === "class" && activeClassTab !== "all" && activeClassTab !== "unassigned" ? activeClassTab : undefined,
    classTab: viewMode === "class" && activeClassTab === "unassigned" ? "unassigned" : undefined,
    startDate: filters.dateRange.from ? format(filters.dateRange.from, "yyyy-MM-dd") : undefined,
    endDate: filters.dateRange.to ? format(filters.dateRange.to, "yyyy-MM-dd") : undefined,
    updatedFrom: filters.updatedRange.from ? format(filters.updatedRange.from, "yyyy-MM-dd") : undefined,
    updatedTo: filters.updatedRange.to ? format(filters.updatedRange.to, "yyyy-MM-dd") : undefined,
    accountStatuses: filters.accountStatuses.length > 0 ? filters.accountStatuses : undefined,
    learningStatuses: filters.learningStatuses.length > 0 ? filters.learningStatuses : undefined,
    birthdayFrom: filters.birthdayFrom || undefined,
    birthdayTo: filters.birthdayTo || undefined,
  });

  const students = studentsData?.students || [];
  const totalItems = studentsData?.total || 0;
  const totalPages = Math.ceil(totalItems / pageSize);

  const { data: learningSummary, isLoading: summaryLoading } = useQuery<{
    dangHoc: number; baoLuu: number; choLich: number; daNghi: number; chuaCoLich: number; total: number;
  }>({
    queryKey: ["/api/students/customer-learning-status-summary"],
    queryFn: () => fetch("/api/students/customer-learning-status-summary", { credentials: "include" }).then((r) => r.json()),
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: false,
  });

  const studentIds = students.map((s) => s.id);

  const { data: starBalancesMap = {} } = useQuery<Record<string, number>>({
    queryKey: ["/api/students/star-balances", studentIds.join(",")],
    queryFn: async () => {
      if (studentIds.length === 0) return {};
      const res = await fetch(`/api/students/star-balances?ids=${studentIds.join(",")}`, { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: studentIds.length > 0,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: endingSoonMap = {} } = useQuery<Record<string, { className: string; remainingSessions: number; endDate: string }[]>>({
    queryKey: ["/api/student-classes/ending-soon", "customers-badge", studentIds.join(",")],
    queryFn: async () => {
      if (studentIds.length === 0) return {};
      const res = await fetch(
        `/api/student-classes/ending-soon?pageSize=50&studentIds=${studentIds.join(",")}`,
        { credentials: "include" }
      );
      if (!res.ok) return {};
      const json = await res.json();
      const rows: any[] = json.data ?? [];
      const map: Record<string, { className: string; remainingSessions: number; endDate: string }[]> = {};
      // Ngày hôm qua theo local time (ẩn lịch kết thúc trước hôm qua)
      const now = new Date();
      const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const yd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const yesterdayLocal = `${yd.getFullYear()}-${String(yd.getMonth() + 1).padStart(2, "0")}-${String(yd.getDate()).padStart(2, "0")}`;
      for (const row of rows) {
        const sid = row.studentId;
        if (!sid) continue;
        // endDate có thể là "YYYY-MM-DD" hoặc ISO datetime, lấy 10 ký tự đầu
        const endDate: string = (row.endDate ?? "").slice(0, 10);
        // Ẩn những lịch có ngày kết thúc trước hôm qua (endDate < hôm qua)
        if (endDate && endDate < yesterdayLocal) continue;
        if (!map[sid]) map[sid] = [];
        map[sid].push({
          className: row.className ?? row.classCode ?? "-",
          remainingSessions: Number(row.remainingSessions ?? 0),
          endDate,
        });
      }
      return map;
    },
    enabled: studentIds.length > 0,
    staleTime: 3 * 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: overdueInvoicesMap = {} } = useQuery<Record<string, { id: string; code: string; dueDate: string | null; daysOverdue: number; remainingAmount: number; debtStatus: string }[]>>({
    queryKey: ["/api/finance/invoices/overdue-by-students", studentIds.join(",")],
    queryFn: async () => {
      if (studentIds.length === 0) return {};
      const res = await fetch(`/api/finance/invoices/overdue-by-students?studentIds=${studentIds.join(",")}`, { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: studentIds.length > 0,
    staleTime: 3 * 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: studentTasksMap } = useQuery<Record<string, any[]>>({
    queryKey: ["/api/tasks/by-subjects", studentIds.join(",")],
    queryFn: () =>
      studentIds.length === 0
        ? Promise.resolve({})
        : fetch(`/api/tasks/by-subjects?ids=${studentIds.join(",")}`, { credentials: "include" }).then((r) => r.json()),
    enabled: studentIds.length > 0,
    staleTime: 3 * 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: learningStatuses } = useQuery<Record<string, string>>({
    queryKey: ["/api/students/learning-statuses", studentIds.join(",")],
    queryFn: () =>
      studentIds.length === 0
        ? Promise.resolve({})
        : fetch(`/api/students/learning-statuses?ids=${studentIds.join(",")}`, { credentials: "include" }).then((r) => r.json()),
    enabled: studentIds.length > 0,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const [columnSearch, setColumnSearch] = useState("");
  const [isActivityLogOpen, setIsActivityLogOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  const { data: parentsData } = useStudents({ type: "Phụ huynh", limit: 1000, enabled: isAddOpen || isEditOpen });

  const { t } = useLanguage();
  const { data: myPerms } = useMyPermissions();
  const rawCrmPerms = myPerms?.permissions?.["/customers"];
  const rawClassPerms = myPerms?.permissions?.["/classes"];
  const canAccessClasses =
    myPerms?.isSuperAdmin === true ||
    rawClassPerms?.canView === true ||
    rawClassPerms?.canViewAll === true;
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
  const [, navigate] = useLocation();
  const [editingStudent, setEditingStudent] = useState<StudentResponse | null>(null);
  const [zaloStudent, setZaloStudent] = useState<StudentResponse | null>(null);

  // FB conversations — dùng để biết HV nào đã liên kết Facebook
  const { data: fbConversations = [] } = useQuery<any[]>({
    queryKey: ["/api/facebook/conversations"],
    queryFn: () => fetch("/api/facebook/conversations", { credentials: "include" }).then(r => r.json()),
    staleTime: 60_000,
  });
  const fbLinkedStudentIds = useMemo(
    () => new Set(fbConversations.filter((c: any) => c.studentId).map((c: any) => c.studentId as string)),
    [fbConversations],
  );
  const handleFacebookChat = (student: StudentResponse) => {
    const conv = fbConversations.find((c: any) => c.studentId === student.id);
    if (conv) {
      navigate(`/facebook?conv=${conv.id}`);
    } else {
      navigate(`/facebook`);
    }
  };

  const { data: freshEditingStudent } = useStudent(editingStudent?.id || "");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [selectedStudentDetail, setSelectedStudentDetail] = useState<StudentResponse | null>(null);

  const handleViewDetail = (student: StudentResponse) => {
    setSelectedStudentDetail(student);
    window.history.replaceState({}, '', `/customers/${student.id}`);
  };

  const handleViewClass = (classId: string) => {
    if (!canAccessClasses) {
      toast({
        title: "Bạn không có quyền",
        description: "Bạn không có quyền truy cập trang lớp học.",
        variant: "destructive",
      });
      return;
    }
    window.open(`/classes/${classId}`, "_blank", "noopener,noreferrer");
  };

  const handleCloseDetail = (open: boolean) => {
    if (!open) {
      setSelectedStudentDetail(null);
      window.history.replaceState({}, '', '/customers');
    }
  };
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
  const crmFilterEnabled = isFilterOpen || isAddOpen || isEditOpen || isImportOpen;
  const { data: crmSources } = useCrmCustomerSources(crmFilterEnabled);
  const { data: crmReasons } = useCrmRejectReasons(crmFilterEnabled);
  const { data: crmCustomFields } = useCrmCustomFields();
  const { data: crmSchools = [] } = useQuery<CrmSchool[]>({
    queryKey: ["/api/crm/schools"],
    queryFn: async () => {
      const res = await fetch("/api/crm/schools", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch CRM schools");
      return res.json();
    },
    enabled: crmFilterEnabled,
    staleTime: 5 * 60_000,
  });

  // Merge custom-field columns just before "actions" — preserve user's saved order/visibility.
  useEffect(() => {
    if (!crmCustomFields) return;
    setColumns((prev) => {
      const existingIds = new Set(prev.map((c) => c.id));
      const wantedIds = new Set((crmCustomFields ?? []).map((c) => makeCustomFieldKey(c.id)));
      // Drop deleted custom columns
      let next = prev.filter((c) => !c.id.startsWith("custom:") || wantedIds.has(c.id));
      // Append new custom columns just before the trailing "actions"
      const toAdd = (crmCustomFields ?? [])
        .filter((c) => !existingIds.has(makeCustomFieldKey(c.id)))
        .map((c) => ({ id: makeCustomFieldKey(c.id), label: c.label, visible: true } as ColumnConfig));
      // Sync labels for existing custom columns (in case label changed)
      next = next.map((c) => {
        const id = c.id.startsWith("custom:") ? c.id.slice("custom:".length) : null;
        if (!id) return c;
        const def = crmCustomFields?.find((d) => d.id === id);
        return def ? { ...c, label: def.label } : c;
      });
      if (toAdd.length === 0 && next.length === prev.length) {
        // No changes other than possible label updates
        const labelChanged = next.some((c, i) => c.label !== prev[i]?.label);
        return labelChanged ? next : prev;
      }
      const actionsIdx = next.findIndex((c) => c.id === "actions");
      if (actionsIdx >= 0) {
        next = [...next.slice(0, actionsIdx), ...toAdd, ...next.slice(actionsIdx)];
      } else {
        next = [...next, ...toAdd];
      }
      return next;
    });
  }, [crmCustomFields]);
  const { data: locations } = useLocations();
  const { data: staff } = useStaff(undefined, true);

  const sortedRelationships = useMemo(() => {
    if (!crmRelationships) return [];
    return [...crmRelationships].sort((a, b) => parseInt(a.position || "0") - parseInt(b.position || "0"));
  }, [crmRelationships]);

  const inferredParentIds = useMemo(
    () => new Set(sortedRelationships.map((r: CrmRelationship) => r.parentId).filter((id): id is string => Boolean(id))),
    [sortedRelationships]
  );
  const isParentRelationship = (relationship: CrmRelationship) =>
    !relationship.isSystemDefault && Boolean(relationship.isParentGroup || inferredParentIds.has(relationship.id));
  const parentRelationships = useMemo(
    () => sortedRelationships.filter((r: CrmRelationship) => isParentRelationship(r)),
    [sortedRelationships, inferredParentIds]
  );
  const ungroupedRelationships = useMemo(
    () => sortedRelationships.filter((r: CrmRelationship) =>
      r.isSystemDefault
        ? r.isUsed === true
        : !isParentRelationship(r) && !r.parentId
    ),
    [sortedRelationships, inferredParentIds]
  );
  const childrenOfSelected = useMemo(() => {
    if (!activeGroupId) return [];
    return sortedRelationships.filter((r: CrmRelationship) => !r.isSystemDefault && !isParentRelationship(r) && r.parentId === activeGroupId);
  }, [sortedRelationships, activeGroupId, inferredParentIds]);

  type StaffMember = { id: string; fullName: string; roleNames?: string[] };
  const typedStaff = useMemo(() => (staff as StaffMember[] | undefined) ?? [], [staff]);
  const teachers = useMemo(() => typedStaff.filter(s => (s.roleNames || []).some(r => r === "Giáo viên" || r === "Trợ giảng")), [typedStaff]);
  const sales = useMemo(() => typedStaff.filter(s => !(s.roleNames || []).some(r => r === "Giáo viên" || r === "Trợ giảng")), [typedStaff]);
  const managers = typedStaff;
  const parents = useMemo(() => parentsData?.students || [], [parentsData]);
  const { data: classesRaw = [] } = useQuery<{ id: string; name: string; classCode?: string }[]>({
    queryKey: ["/api/classes", { minimal: true }],
    queryFn: async () => {
      const res = await fetch("/api/classes?minimal=true", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 2 * 60_000,
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (viewMode === "class") {
      params.set("view", "class");
      params.delete("classId");
      params.delete("classTab");
      if (activeClassTab === "unassigned") params.set("classTab", "unassigned");
      else if (activeClassTab !== "all") params.set("classId", activeClassTab);
    } else {
      params.delete("view");
      params.delete("classId");
      params.delete("classTab");
    }
    const query = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  }, [viewMode, activeClassTab]);

  const visibleColumns = useMemo(() => {
    const filtered = columns.filter((c) => c.visible);
    const nonActions = filtered.filter((c) => c.id !== "actions");
    const actions = filtered.filter((c) => c.id === "actions");
    return [...nonActions, ...actions];
  }, [columns]);

  useEffect(() => {
    setIsActionMenuOpen(selectedIds.length > 0);
  }, [selectedIds]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filters, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds([]);
  }, [viewMode, activeClassTab]);

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
        toast({ title: t("common.success"), description: t("customers.toastCreated") });
      },
    });
  };

  const handleUpdate = (data: z.infer<typeof api.students.update.input>) => {
    if (!editingStudent) return;
    const cleanedData = { ...data };
    if (cleanedData.classId === "") delete cleanedData.classId;
    if (!cleanedData.password?.trim()) delete cleanedData.password;
    updateStudent.mutate(
      { id: editingStudent.id, ...cleanedData },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/customers/activity-logs"] });
          setIsEditOpen(false);
          setEditingStudent(null);
          toast({ title: t("common.success"), description: t("customers.toastUpdated") });
        },
        onError: () => {
          toast({ title: t("common.error"), description: t("customers.toastUpdateError"), variant: "destructive" });
        },
      }
    );
  };

  const handleDelete = (id: string) => {
    if (confirm(t("customers.confirmDelete"))) {
      deleteStudent.mutate(id, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/customers/activity-logs"] });
          toast({ title: t("common.success"), description: t("customers.toastDeleted") });
        },
        onError: (error) => {
          toast({
            title: t("common.error"),
            description: error instanceof Error ? error.message : t("customers.toastDeleteError"),
            variant: "destructive",
          });
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
    (viewMode === "relationship" && filters.classIds.length > 0) ||
    filters.schoolIds.length > 0 ||
    filters.birthYear !== "" ||
    !!filters.dateRange.from ||
    !!filters.updatedRange.from ||
    filters.accountStatuses.length > 0 ||
    filters.learningStatuses.length > 0 ||
    filters.birthdayFrom !== "" ||
    filters.birthdayTo !== "";

  const visibleChildren = activeGroupId ? childrenOfSelected : ungroupedRelationships;
  const classTabs = classTabsData?.classes ?? [];

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full gap-3">

        {/* ── Stat Cards + Add Button ── */}
        <div className="flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Tổng KH */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 shadow-md shadow-sky-200 min-w-[90px]">
              <Users className="w-4 h-4 text-white/80 flex-shrink-0" />
              <div>
                <p className="text-[10px] font-semibold text-white/70 uppercase tracking-wide leading-none">{t("customers.statTotal")}</p>
                <p className="text-base font-bold text-white leading-tight mt-0.5">
                  {summaryLoading ? "…" : (learningSummary?.total ?? totalItems).toLocaleString()}
                </p>
              </div>
            </div>

            {/* Đang học */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-emerald-200 shadow-sm min-w-[90px]">
              <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
              <div>
                <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide leading-none">{t("customers.statActive")}</p>
                <p className="text-base font-bold text-emerald-700 leading-tight mt-0.5">
                  {summaryLoading ? "…" : (learningSummary?.dangHoc ?? 0).toLocaleString()}
                </p>
              </div>
            </div>

            {/* Chưa có lịch */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 shadow-sm min-w-[100px]">
              <span className="w-2 h-2 rounded-full bg-slate-400 flex-shrink-0" />
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide leading-none">{t("customers.statNoSchedule")}</p>
                <p className="text-base font-bold text-slate-600 leading-tight mt-0.5">
                  {summaryLoading ? "…" : (learningSummary?.chuaCoLich ?? 0).toLocaleString()}
                </p>
              </div>
            </div>

            {/* Bảo lưu */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-amber-200 shadow-sm min-w-[90px]">
              <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
              <div>
                <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide leading-none">{t("customers.statDeferred")}</p>
                <p className="text-base font-bold text-amber-700 leading-tight mt-0.5">
                  {summaryLoading ? "…" : (learningSummary?.baoLuu ?? 0).toLocaleString()}
                </p>
              </div>
            </div>

            {/* Đã nghỉ */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-rose-200 shadow-sm min-w-[90px]">
              <span className="w-2 h-2 rounded-full bg-rose-500 flex-shrink-0" />
              <div>
                <p className="text-[10px] font-semibold text-rose-600 uppercase tracking-wide leading-none">{t("customers.statInactive")}</p>
                <p className="text-base font-bold text-rose-700 leading-tight mt-0.5">
                  {summaryLoading ? "…" : (learningSummary?.daNghi ?? 0).toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-slate-200 bg-white shadow-sm">
              {([
                ["relationship", "Theo mối quan hệ"],
                ["class", "Theo lớp"],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => {
                    setViewMode(mode);
                    if (mode === "class") setActiveClassTab("all");
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap",
                    viewMode === mode
                      ? "bg-sky-100 text-sky-700 shadow-sm"
                      : "text-muted-foreground hover:bg-slate-100 hover:text-foreground"
                  )}
                  data-testid={`customers-view-${mode}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {crmPerms.canCreate && (
                <Button
                  onClick={() => setIsAddOpen(true)}
                  size="sm"
                  className="h-9 px-4 rounded-xl text-xs gap-1.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 shadow-lg shadow-sky-200 border-0"
                >
                  <Plus className="w-4 h-4" />
                  {t("customers.addStudent")}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setIsGuideOpen(true)}
                className="h-9 w-9 rounded-xl border-sky-200 bg-white text-sky-600 shadow-sm hover:bg-sky-50 hover:text-sky-700"
                aria-label="Mở tài liệu hướng dẫn trang Học viên"
                title="Tài liệu hướng dẫn trang Học viên"
              >
                <BookOpen className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* View mode + relationship/class tabs */}
        <div className="bg-white border border-border rounded-2xl shadow-sm px-4 pt-3 pb-2.5 flex-shrink-0">
          {viewMode === "relationship" ? (
            <>
              {/* Row 1: Tab-bar — Tất cả + parent groups */}
              <div className="flex items-end gap-0 border-b border-border/60 overflow-x-auto">
                <button
                  onClick={() => { setActiveGroupId(null); setFilters((f) => ({ ...f, pipelineStage: "all" })); }}
                  className={cn(
                    "relative px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors select-none",
                    activeGroupId === null && filters.pipelineStage === "all"
                      ? "text-sky-600 font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  data-testid="filter-btn-all"
                >
                  {t("customers.filterAll")}
                  {activeGroupId === null && filters.pipelineStage === "all" && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-sky-500 rounded-t-full" />
                  )}
                </button>

                {parentRelationships.map((group: CrmRelationship) => {
                  const isGroupActive = activeGroupId === group.id;
                  const color = group.color || "#8b5cf6";
                  return (
                    <button
                      key={group.id}
                      onClick={() => { setActiveGroupId(group.id); setFilters((f) => ({ ...f, pipelineStage: "all" })); }}
                      className={cn(
                        "relative px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors select-none",
                        isGroupActive ? "text-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        {group.name}
                      </span>
                      {isGroupActive && (
                        <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full" style={{ backgroundColor: color }} />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Row 2: Child pipeline badges */}
              {visibleChildren.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-2.5 pb-0.5">
                  {visibleChildren.map((rel: CrmRelationship) => {
                    const isActive = filters.pipelineStage === rel.name;
                    const color = rel.color || "#8b5cf6";
                    return (
                      <button
                        key={rel.id}
                        onClick={() => setFilters((f) => ({ ...f, pipelineStage: isActive ? "all" : rel.name }))}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all",
                          isActive ? "text-white shadow-md" : "bg-white hover:opacity-90 hover:shadow-sm"
                        )}
                        style={isActive ? { backgroundColor: color, borderColor: color } : { borderColor: `${color}60`, color }}
                        data-testid={`filter-btn-${rel.name}`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: isActive ? "rgba(255,255,255,0.8)" : color }} />
                        {rel.name}{rel.isSystemDefault ? "*" : ""}
                      </button>
                    );
                  })}
                </div>
              )}

            </>
          ) : (
            <div className="flex items-end gap-0 border-b border-border/60 overflow-x-auto">
              <button
                onClick={() => setActiveClassTab("all")}
                className={cn(
                  "relative px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                  activeClassTab === "all" ? "text-sky-600 font-semibold" : "text-muted-foreground hover:text-foreground"
                )}
                data-testid="class-tab-all"
              >
                {t("customers.filterAll")}
                {activeClassTab === "all" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-sky-500 rounded-t-full" />}
              </button>
              {classTabsData?.hasUnassigned && (
                <button
                  onClick={() => setActiveClassTab("unassigned")}
                  className={cn(
                    "relative px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                    activeClassTab === "unassigned" ? "text-sky-600 font-semibold" : "text-muted-foreground hover:text-foreground"
                  )}
                  data-testid="class-tab-unassigned"
                >
                  Chưa có lớp
                  {activeClassTab === "unassigned" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-sky-500 rounded-t-full" />}
                </button>
              )}
              {classTabsLoading ? (
                <span className="px-4 py-2 text-xs text-muted-foreground">Đang tải lớp…</span>
              ) : (
                classTabs.map((classTab) => (
                  <button
                    key={classTab.id}
                    onClick={() => setActiveClassTab(classTab.id)}
                    className={cn(
                      "relative px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                      activeClassTab === classTab.id ? "text-sky-600 font-semibold" : "text-muted-foreground hover:text-foreground"
                    )}
                    title={classTab.classCode}
                    data-testid={`class-tab-${classTab.id}`}
                  >
                    {classTab.name || classTab.classCode}
                    {activeClassTab === classTab.id && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-sky-500 rounded-t-full" />}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="bg-card border border-border shadow-sm rounded-2xl flex flex-col flex-1 overflow-hidden min-h-0">
          {/* Toolbar */}
          <div className="px-4 py-2.5 border-b border-border/60 flex flex-col md:flex-row gap-2 items-center justify-between bg-slate-50/50 flex-shrink-0">
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <Input
                placeholder={t("customers.searchPlaceholder")}
                className="pl-9 h-9 bg-white text-xs rounded-xl border-slate-200"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                data-testid="input-search-customers"
              />
            </div>

            <div className="flex items-center gap-1.5 w-full md:w-auto flex-wrap">
              {crmPerms.canCreate && (
                <Button variant="outline" size="sm" onClick={() => setIsImportOpen(true)} className="h-8 px-3 rounded-xl text-xs gap-1.5 bg-white border-slate-200 hover:bg-slate-50 shadow-sm">
                  <Upload className="w-3.5 h-3.5 text-slate-500" /><span>{t("customers.upload")}</span>
                </Button>
              )}
              {crmPerms.canEdit && (
                <Button variant="outline" size="sm" onClick={excel.exportToExcel} className="h-8 px-3 rounded-xl text-xs gap-1.5 bg-white border-slate-200 hover:bg-slate-50 shadow-sm">
                  <Download className="w-3.5 h-3.5 text-slate-500" /><span>{t("customers.download")}</span>
                </Button>
              )}
              {crmPerms.canEdit && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 px-3 rounded-xl text-xs gap-1.5 bg-white border-slate-200 hover:bg-slate-50 shadow-sm">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" /><span>{t("customers.columns")}</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-0 rounded-2xl shadow-xl border-slate-200 overflow-hidden" align="end">
                    <div className="flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-slate-50 to-slate-100/50 border-b border-slate-200">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center flex-shrink-0">
                        <SlidersHorizontal className="w-3.5 h-3.5 text-white" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-700 leading-none">{t("customers.columnSettings")}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{t("customers.columnDragHint")}</p>
                      </div>
                    </div>
                    <div className="p-3 border-b border-slate-100">
                      <Input
                        placeholder={t("customers.searchColumns")}
                        className="h-8 text-xs rounded-xl border-slate-200 bg-slate-50"
                        value={columnSearch}
                        onChange={(e) => setColumnSearch(e.target.value)}
                      />
                    </div>
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                      <SortableContext items={columns.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                        <div className="max-h-[360px] overflow-y-auto p-2">
                          {columns
                            .map((c) => {
                              if (c.id.startsWith("custom:")) {
                                const customId = c.id.slice("custom:".length);
                                const customField = crmCustomFields?.find((field) => field.id === customId);
                                return {
                                  ...c,
                                  // Custom fields do not have translation keys. Keep the
                                  // configured CRM label (e.g. "CCCD") instead of showing
                                  // the internal custom:<uuid> key.
                                  label: customField?.label || c.label || "Thông tin bổ sung",
                                };
                              }
                              return { ...c, label: t(`customers.col.${c.id}`) || c.label };
                            })
                            .filter((c) => !columnSearch || c.label.toLowerCase().includes(columnSearch.toLowerCase()))
                            .map((column) => (
                              <SortableColumnItem key={column.id} column={column} onToggle={toggleColumn} />
                            ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </PopoverContent>
                </Popover>
              )}
              {crmPerms.canEdit && (
                <DropdownMenu open={isActionMenuOpen} onOpenChange={setIsActionMenuOpen} modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-8 px-3 rounded-xl text-xs gap-1.5 bg-white border-slate-200 hover:bg-slate-50 shadow-sm",
                        selectedIds.length > 0 && "border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100"
                      )}
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>{selectedIds.length > 0 ? t("customers.actionsCount").replace("{{n}}", String(selectedIds.length)) : t("customers.actions")}</span>
                      <ChevronDown className="w-3 h-3 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-56 p-2 rounded-xl bg-white shadow-xl border-border"
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
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-b mb-1">{t("customers.bulkActions")}</div>
                        <DropdownMenuItem className="flex items-center gap-3 py-2 cursor-pointer rounded-lg hover:bg-accent text-xs" onClick={() => bulk.setIsBulkRelOpen(true)}>
                          <Users className="w-3.5 h-3.5 text-pink-500" /><span>{t("customers.bulkRelationship")}</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem className="flex items-center gap-3 py-2 cursor-pointer rounded-lg hover:bg-accent text-xs" onClick={() => bulk.setIsBulkLocationOpen(true)}>
                          <Building2 className="w-3.5 h-3.5 text-blue-600" /><span>{t("customers.bulkBranch")}</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem className="flex items-center gap-3 py-2 cursor-pointer rounded-lg hover:bg-accent text-xs" onClick={() => bulk.setIsBulkSaleOpen(true)}>
                          <UserCog className="w-3.5 h-3.5 text-orange-500" /><span>{t("customers.bulkSale")}</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem className="flex items-center gap-3 py-2 cursor-pointer rounded-lg hover:bg-accent text-xs" onClick={() => bulk.setIsBulkManagerOpen(true)}>
                          <UserPlus className="w-3.5 h-3.5 text-green-500" /><span>{t("customers.bulkManager")}</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem className="flex items-center gap-3 py-2 cursor-pointer rounded-lg hover:bg-accent text-xs" onClick={() => bulk.setIsBulkTeacherOpen(true)}>
                          <GraduationCap className="w-3.5 h-3.5 text-purple-600" /><span>{t("customers.bulkTeacher")}</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem className="flex items-center gap-3 py-2 cursor-pointer rounded-lg hover:bg-accent text-xs" onClick={() => bulk.setIsBulkParentOpen(true)}>
                          <UserCircle className="w-3.5 h-3.5 text-teal-500" /><span>{t("customers.bulkParent")}</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem className="flex items-center gap-3 py-2 cursor-pointer rounded-lg hover:bg-accent text-xs" onClick={() => bulk.setIsAssignClassOpen(true)}>
                          <BookOpen className="w-3.5 h-3.5 text-blue-500" /><span>{t("customers.bulkClass")}</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem className="flex items-center gap-3 py-2 cursor-pointer rounded-lg hover:bg-accent text-xs" onClick={(e) => { e.preventDefault(); bulk.setIsAccountStatusOpen(true); setIsActionMenuOpen(false); }}>
                          <Tablet className="w-3.5 h-3.5 text-indigo-600" /><span>{t("customers.bulkAccountStatus")}</span>
                        </DropdownMenuItem>
                        {crmPerms.canDelete && (
                          <>
                            <div className="my-1 border-t" />
                            <DropdownMenuItem
                              className="flex items-center gap-3 py-2 cursor-pointer rounded-lg text-destructive focus:text-destructive focus:bg-destructive/10 text-xs"
                              onClick={() => bulk.handleBulkDelete(selectedIds)}
                            >
                              <Trash className="w-3.5 h-3.5" /><span>{t("customers.bulkDelete").replace("{{n}}", String(selectedIds.length))}</span>
                            </DropdownMenuItem>
                          </>
                        )}
                      </>
                    ) : (
                      <div className="px-4 py-3 text-xs text-muted-foreground text-center">{t("customers.selectToAction")}</div>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {/* ── Nút Bộ lọc ── */}
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-8 px-3 rounded-xl text-xs gap-1.5 bg-white border-slate-200 hover:bg-slate-50 shadow-sm",
                  hasActiveFilters && "border-violet-300 text-violet-700 bg-violet-50 hover:bg-violet-100"
                )}
                data-testid="button-filter-customers"
                onClick={() => setIsFilterOpen(true)}
              >
                <Filter className="w-3.5 h-3.5" /> {t("customers.filter")}
                {hasActiveFilters && (
                  <span className="w-4 h-4 rounded-full bg-violet-600 text-white text-[10px] flex items-center justify-center font-bold">!</span>
                )}
              </Button>

              {/* ── Dialog Bộ lọc nâng cao ── */}
              <Dialog open={isFilterOpen} onOpenChange={setIsFilterOpen}>
                <DialogContent className="max-w-md w-full p-0 gap-0 rounded-2xl overflow-hidden">
                  <DialogHeader className="px-5 py-4 border-b border-violet-100 bg-gradient-to-r from-violet-50 to-purple-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-sm shadow-violet-200">
                          <Filter className="w-3.5 h-3.5 text-white" />
                        </div>
                        <div>
                          <DialogTitle className="text-sm font-bold text-violet-800 leading-none">{t("customers.filterAdvanced")}</DialogTitle>
                          {hasActiveFilters && <p className="text-[11px] text-violet-500 mt-0.5">{t("customers.filterApplied")}</p>}
                        </div>
                      </div>
                    </div>
                  </DialogHeader>

                  <div className="overflow-y-auto max-h-[70vh] px-5 py-4 space-y-3 bg-white">
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{t("customers.filterBranch")}</Label>
                      <Select value={filters.locationId} onValueChange={(v) => setFilters((f) => ({ ...f, locationId: v }))}>
                        <SelectTrigger className="h-9 rounded-xl border-slate-200 bg-white text-xs"><SelectValue placeholder={t("customers.allBranches")} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t("customers.allBranches")}</SelectItem>
                          {locations?.map((loc: Location) => <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{t("customers.filterType")}</Label>
                      <Select value={filters.type} onValueChange={(v) => setFilters((f) => ({ ...f, type: v }))}>
                        <SelectTrigger className="h-9 rounded-xl border-slate-200 bg-white text-xs"><SelectValue placeholder={t("customers.allTypes")} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t("customers.allTypes")}</SelectItem>
                          <SelectItem value="Học viên">{t("customers.typeStudent")}</SelectItem>
                          <SelectItem value="Phụ huynh">{t("customers.typeParent")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{t("customers.filterSource")}</Label>
                      <SearchableMultiSelect
                        placeholder={t("customers.selectSource")}
                        options={crmSources?.map((s: CrmCustomerSource) => ({ id: s.name, name: s.name })) || []}
                        selected={filters.sources}
                        onSelect={(val) => setFilters((f) => ({ ...f, sources: [...f.sources, val] }))}
                        onRemove={(val) => setFilters((f) => ({ ...f, sources: f.sources.filter((s) => s !== val) }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{t("customers.filterRejectReason")}</Label>
                      <SearchableMultiSelect
                        placeholder={t("customers.selectReason")}
                        options={crmReasons?.map((r: CrmRejectReason) => ({ id: r.reason, reason: r.reason })) || []}
                        selected={filters.rejectReasons}
                        onSelect={(val) => setFilters((f) => ({ ...f, rejectReasons: [...f.rejectReasons, val] }))}
                        onRemove={(val) => setFilters((f) => ({ ...f, rejectReasons: f.rejectReasons.filter((r) => r !== val) }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{t("customers.filterSale")}</Label>
                      <SearchableMultiSelect
                        placeholder={t("customers.selectSale")}
                        options={sales.map((s) => ({ id: s.id, fullName: s.fullName }))}
                        selected={filters.saleIds}
                        onSelect={(val) => setFilters((f) => ({ ...f, saleIds: [...f.saleIds, val] }))}
                        onRemove={(val) => setFilters((f) => ({ ...f, saleIds: f.saleIds.filter((id) => id !== val) }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{t("customers.filterManager")}</Label>
                      <SearchableMultiSelect
                        placeholder={t("customers.selectManager")}
                        options={managers.map((s) => ({ id: s.id, fullName: s.fullName }))}
                        selected={filters.managerIds}
                        onSelect={(val) => setFilters((f) => ({ ...f, managerIds: [...f.managerIds, val] }))}
                        onRemove={(val) => setFilters((f) => ({ ...f, managerIds: f.managerIds.filter((id) => id !== val) }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{t("customers.filterTeacher")}</Label>
                      <SearchableMultiSelect
                        placeholder={t("customers.selectTeacher")}
                        options={teachers.map((s) => ({ id: s.id, fullName: s.fullName }))}
                        selected={filters.teacherIds}
                        onSelect={(val) => setFilters((f) => ({ ...f, teacherIds: [...f.teacherIds, val] }))}
                        onRemove={(val) => setFilters((f) => ({ ...f, teacherIds: f.teacherIds.filter((id) => id !== val) }))}
                      />
                    </div>
                    {viewMode === "relationship" && (
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{t("customers.filterClass")}</Label>
                        <SearchableMultiSelect
                          placeholder={t("customers.selectClass")}
                          options={classes}
                          selected={filters.classIds}
                          onSelect={(val) => setFilters((f) => ({ ...f, classIds: [...f.classIds, val] }))}
                          onRemove={(val) => setFilters((f) => ({ ...f, classIds: f.classIds.filter((id) => id !== val) }))}
                        />
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{t("customers.filterSchool")}</Label>
                      <SearchableMultiSelect
                        placeholder={t("customers.selectSchool")}
                        options={crmSchools.map((school) => ({ id: school.id, name: school.name }))}
                        selected={filters.schoolIds}
                        onSelect={(val) => setFilters((f) => ({ ...f, schoolIds: [...f.schoolIds, val] }))}
                        onRemove={(val) => setFilters((f) => ({ ...f, schoolIds: f.schoolIds.filter((id) => id !== val) }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{t("customers.filterBirthYear")}</Label>
                      <Select value={filters.birthYear || undefined} onValueChange={(v) => setFilters((f) => ({ ...f, birthYear: v }))}>
                        <SelectTrigger className="h-9 rounded-xl border-slate-200 bg-white text-xs">
                          <SelectValue placeholder={t("customers.selectBirthYear")} />
                        </SelectTrigger>
                        <SelectContent className="max-h-64">
                          {Array.from({ length: new Date().getFullYear() - 1900 + 1 }, (_, index) => new Date().getFullYear() - index).map((year) => (
                            <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3">
                      <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{t("customers.filterCreatedFrom")}</Label>
                      <StoreDateRangePicker
                        value={filters.dateRange}
                        onChange={(range) => setFilters((f) => ({ ...f, dateRange: range }))}
                        placeholder="Chọn khoảng ngày tạo"
                        className="w-full justify-start"
                      />
                    </div>
                    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3">
                      <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{t("customers.filterUpdatedFrom")}</Label>
                      <StoreDateRangePicker
                        value={filters.updatedRange}
                        onChange={(range) => setFilters((f) => ({ ...f, updatedRange: range }))}
                        placeholder="Chọn khoảng ngày cập nhật"
                        className="w-full justify-start"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{t("customers.filterAccountStatus")}</Label>
                      <SearchableMultiSelect
                        placeholder={t("customers.selectStatus")}
                        options={[
                          { id: "Hoạt động", name: t("customers.statusActive") },
                          { id: "Không hoạt động", name: t("customers.statusInactive") },
                        ]}
                        selected={filters.accountStatuses}
                        onSelect={(val) => setFilters((f) => ({ ...f, accountStatuses: [...f.accountStatuses, val] }))}
                        onRemove={(val) => setFilters((f) => ({ ...f, accountStatuses: f.accountStatuses.filter((s) => s !== val) }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{t("customers.filterStudentStatus")}</Label>
                      <SearchableMultiSelect
                        placeholder={t("customers.selectStatus")}
                        options={[
                          { id: "dang_hoc", name: t("customers.statusLearning") },
                          { id: "cho_lich", name: t("customers.statusWaiting") },
                          { id: "bao_luu", name: t("customers.statusDeferred") },
                          { id: "da_nghi", name: t("customers.statusDropped") },
                          { id: "chua_co_lich", name: t("customers.statusNoSchedule") },
                        ]}
                        selected={filters.learningStatuses}
                        onSelect={(val) => setFilters((f) => ({ ...f, learningStatuses: [...f.learningStatuses, val] }))}
                        onRemove={(val) => setFilters((f) => ({ ...f, learningStatuses: f.learningStatuses.filter((s) => s !== val) }))}
                      />
                    </div>
                    {/* Sinh nhật */}
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{t("customers.filterBirthdayFrom")}</Label>
                      {(() => {
                        const key = "birthdayFrom" as const;
                        const raw = filters[key];
                        const [d, m] = raw ? raw.split("/") : ["", ""];
                        const setMD = (day: string, month: string) => {
                          const next = day && month ? `${day.padStart(2, "0")}/${month.padStart(2, "0")}` : "";
                          setFilters((f) => ({ ...f, [key]: next }));
                        };
                        const daysInMonth = m ? new Date(2000, parseInt(m, 10), 0).getDate() : 31;
                        return (
                          <div className="flex gap-1">
                            <Select value={d || undefined} onValueChange={(v) => setMD(v, m || "01")}>
                              <SelectTrigger className="h-9 flex-1 rounded-xl border-slate-200 text-xs" data-testid="select-birthdayFrom-day">
                                <SelectValue placeholder={t("customers.selectDay")} />
                              </SelectTrigger>
                              <SelectContent className="max-h-64">
                                {Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, "0")).map((dv) => (
                                  <SelectItem key={dv} value={dv}>{dv}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select value={m || undefined} onValueChange={(v) => setMD(d || "01", v)}>
                              <SelectTrigger className="h-9 flex-1 rounded-xl border-slate-200 text-xs" data-testid="select-birthdayFrom-month">
                                <SelectValue placeholder={t("customers.selectMonth")} />
                              </SelectTrigger>
                              <SelectContent className="max-h-64">
                                {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((mv) => (
                                  <SelectItem key={mv} value={mv}>{parseInt(mv, 10)}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      })()}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{t("customers.filterTo")} ({t("customers.filterBirthdayFrom").toLowerCase()})</Label>
                      {(() => {
                        const key = "birthdayTo" as const;
                        const raw = filters[key];
                        const [d, m] = raw ? raw.split("/") : ["", ""];
                        const setMD = (day: string, month: string) => {
                          const next = day && month ? `${day.padStart(2, "0")}/${month.padStart(2, "0")}` : "";
                          setFilters((f) => ({ ...f, [key]: next }));
                        };
                        const daysInMonth = m ? new Date(2000, parseInt(m, 10), 0).getDate() : 31;
                        return (
                          <div className="flex gap-1">
                            <Select value={d || undefined} onValueChange={(v) => setMD(v, m || "01")}>
                              <SelectTrigger className="h-9 flex-1 rounded-xl border-slate-200 text-xs" data-testid="select-birthdayTo-day">
                                <SelectValue placeholder={t("customers.selectDay")} />
                              </SelectTrigger>
                              <SelectContent className="max-h-64">
                                {Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, "0")).map((dv) => (
                                  <SelectItem key={dv} value={dv}>{dv}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select value={m || undefined} onValueChange={(v) => setMD(d || "01", v)}>
                              <SelectTrigger className="h-9 flex-1 rounded-xl border-slate-200 text-xs" data-testid="select-birthdayTo-month">
                                <SelectValue placeholder={t("customers.selectMonth")} />
                              </SelectTrigger>
                              <SelectContent className="max-h-64">
                                {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((mv) => (
                                  <SelectItem key={mv} value={mv}>{parseInt(mv, 10)}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-white">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-slate-500 hover:text-slate-700 rounded-lg"
                      onClick={() => setFilters({ locationId: "all", type: "all", pipelineStage: filters.pipelineStage, sources: [], rejectReasons: [], saleIds: [], managerIds: [], teacherIds: [], classIds: [], schoolIds: [], birthYear: "", dateRange: {} as DateRange, updatedRange: {} as DateRange, accountStatuses: [], learningStatuses: [], birthdayFrom: "", birthdayTo: "" })}
                      data-testid="button-filter-clear-all"
                    >
                      {t("customers.filterClearAll")}
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 px-5 text-xs rounded-lg bg-violet-600 hover:bg-violet-700 text-white"
                      onClick={() => setIsFilterOpen(false)}
                    >
                      Áp dụng
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              <Button
                variant="outline"
                size="sm"
                className="px-3 py-1 rounded-md border text-xs font-medium transition-all flex items-center gap-2 bg-white border-border shadow-sm"
                onClick={() => setIsActivityLogOpen(true)}
                data-testid="btn-nhat-ky"
              >
                <ScrollText className="w-3.5 h-3.5" />
                <span>{t("customers.activityLog")}</span>
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
                const params = new URLSearchParams({
                  create: "1",
                  studentId: student.id,
                  studentName: student.fullName,
                  studentCode: student.code ?? "",
                });
                navigate(`/invoices?${params.toString()}`);
              }}
              onViewDetail={handleViewDetail}
              onViewClass={handleViewClass}
              canEdit={crmPerms.canEdit}
              canDelete={crmPerms.canDelete}
              onChangePipeline={(student, relationshipIds) => {
                updateStudent.mutate(
                  { id: student.id, relationshipIds },
                  {
                    onSuccess: () => toast({ title: t("common.success"), description: t("customers.toastRelUpdated") }),
                    onError: () => toast({ title: t("common.error"), description: t("customers.toastRelError"), variant: "destructive" }),
                  }
                );
              }}
              onChangeAccountStatus={(student, accountStatus) => {
                updateStudent.mutate(
                  { id: student.id, accountStatus },
                  {
                    onSuccess: () => toast({ title: t("common.success"), description: t("customers.toastStatusUpdated") }),
                    onError: () => toast({ title: t("common.error"), description: t("customers.toastStatusError"), variant: "destructive" }),
                  }
                );
              }}
              onZaloChat={(student) => setZaloStudent(student)}
              onFacebookChat={handleFacebookChat}
              fbLinkedStudentIds={fbLinkedStudentIds}
              studentTasksMap={studentTasksMap}
              starBalancesMap={starBalancesMap}
              endingSoonMap={endingSoonMap}
              overdueInvoicesMap={overdueInvoicesMap}
            />
          </div>

          <div className="px-4 py-2.5 border-t border-border/50 text-sm text-muted-foreground flex flex-col sm:flex-row justify-between items-center gap-3 bg-slate-50/50 flex-shrink-0">
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span>{t("customers.showing")} <span className="font-semibold text-slate-700">{students.length}</span> {t("customers.of")} <span className="font-semibold text-slate-700">{totalItems}</span> {t("customers.results")}</span>
              <div className="flex items-center gap-1.5">
                <span>{t("customers.rowsPerPage")}</span>
                <Select value={pageSize.toString()} onValueChange={(v) => setPageSize(parseInt(v))}>
                  <SelectTrigger className="h-7 w-[62px] text-xs rounded-lg border-slate-200 bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="30">30</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1 || isLoading}
                className="h-7 w-7 p-0 rounded-lg border-slate-200 bg-white"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <div className="flex items-center gap-1 px-2 text-xs font-medium text-slate-600">
                <span>{currentPage}</span>
                <span className="text-slate-300">/</span>
                <span>{totalPages || 1}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages || totalPages === 0 || isLoading}
                className="h-7 w-7 p-0 rounded-lg border-slate-200 bg-white"
              >
                <ChevronRight className="w-3.5 h-3.5" />
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
        onDownloadErrors={excel.downloadErrorFile}
      />

      <CustomerGuideDialog open={isGuideOpen} onOpenChange={setIsGuideOpen} />

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-none w-screen h-screen m-0 p-0 overflow-hidden bg-slate-100 border-none shadow-2xl rounded-none">
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
          <div className="h-[calc(100vh-80px)] overflow-y-auto bg-slate-100 p-6 scroll-smooth">
            <div className="max-w-7xl mx-auto">
              <CustomerForm onSubmit={handleCreate} isPending={createStudent.isPending} />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) setEditingStudent(null); }}>
        <DialogContent className="max-w-none w-screen h-screen m-0 p-0 overflow-hidden bg-slate-100 border-none shadow-2xl rounded-none">
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
          <div className="h-[calc(100vh-80px)] overflow-y-auto bg-slate-100 p-6 scroll-smooth">
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
        onOpenChange={handleCloseDetail}
        student={selectedStudentDetail}
        starBalance={selectedStudentDetail ? (starBalancesMap[selectedStudentDetail.id] ?? 0) : 0}
        prefetchedTasks={selectedStudentDetail && studentTasksMap !== undefined ? (studentTasksMap[selectedStudentDetail.id] ?? []) : undefined}
      />

      <CustomerActivityLogDialog
        open={isActivityLogOpen}
        onOpenChange={setIsActivityLogOpen}
      />

      <ZaloCustomerChatPanel
        student={zaloStudent}
        open={!!zaloStudent}
        onClose={() => setZaloStudent(null)}
      />
    </DashboardLayout>
  );
}
