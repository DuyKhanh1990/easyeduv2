import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { Sidebar } from "@/components/layout/Sidebar";
import { useSidebarVisibility } from "@/hooks/use-sidebar-visibility";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Edit2, Copy, Clock, CalendarRange, ClipboardList, ChevronLeft, ChevronRight } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { MultiSelect } from "@/components/ui/multi-select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";

const weekdays = [
  { id: 1, label: "Thứ 2" },
  { id: 2, label: "Thứ 3" },
  { id: 3, label: "Thứ 4" },
  { id: 4, label: "Thứ 5" },
  { id: 5, label: "Thứ 6" },
  { id: 6, label: "Thứ 7" },
  { id: 0, label: "Chủ Nhật" },
];

const formSchema = z.object({
  locationId: z.string().min(1, "Vui lòng chọn cơ sở"),
  teacherId: z.string().min(1, "Vui lòng chọn giáo viên"),
  shiftTemplateId: z.string().min(1, "Vui lòng chọn ca"),
  weekdays: z.array(z.number()).min(1, "Vui lòng chọn ít nhất một thứ"),
  effectiveFrom: z.string().optional(),
  effectiveTo: z.string().optional(),
});

const shiftAssignmentSchema = z.object({
  name: z.string().min(1, "Vui lòng nhập tên phân ca"),
  locationId: z.string().min(1, "Vui lòng chọn cơ sở"),
  targetType: z.enum(["department", "role", "staff"]),
  targetId: z.string().min(1, "Vui lòng chọn đối tượng"),
  byWeekday: z.boolean().default(true),
  weekdaySchedule: z.record(z.array(z.string())).optional(),
  shiftTemplateId: z.string().optional().nullable(),
  effectiveFrom: z.string().optional(),
  effectiveTo: z.string().optional(),
});

const shiftConfigSchema = z.object({
  locationId: z.string().min(1, "Vui lòng chọn cơ sở"),
  code: z.string().min(1, "Vui lòng nhập mã ca"),
  name: z.string().min(1, "Vui lòng nhập tên ca"),
  startTime: z.string().min(1, "Vui lòng chọn giờ bắt đầu"),
  endTime: z.string().min(1, "Vui lòng chọn giờ kết thúc"),
  lunchBreakMinutes: z.coerce.number().min(0, "Phải >= 0").default(0),
  lateMinutes: z.coerce.number().min(0, "Phải >= 0").default(0),
  earlyLeaveMinutes: z.coerce.number().min(0, "Phải >= 0").default(0),
  workUnits: z.coerce.number().min(0, "Phải >= 0").default(1),
  status: z.enum(["active", "inactive"]).default("active"),
  note: z.string().optional(),
});

type TabKey = "register" | "board" | "assign" | "config";

function getTabFromUrl(): TabKey {
  if (typeof window === "undefined") return "register";
  const t = new URLSearchParams(window.location.search).get("tab");
  if (t === "board" || t === "assign" || t === "config") return t;
  return "register";
}

const tabs: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "register", label: "Đăng ký ca dạy", icon: Clock },
  { key: "board", label: "Bảng phân ca", icon: CalendarRange },
  { key: "assign", label: "Phân ca làm việc", icon: ClipboardList },
  { key: "config", label: "Cấu hình ca làm việc", icon: Clock },
];

function calcTotalHours(startTime: string, endTime: string, lunchMinutes: number) {
  if (!startTime || !endTime) return 0;
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  const diff = endMin - startMin - (lunchMinutes || 0);
  return diff > 0 ? Math.round((diff / 60) * 100) / 100 : 0;
}

export function ShiftManagement() {
  const { toast } = useToast();
  const { isSubTabVisible } = useSidebarVisibility();
  const { data: myPerms } = useMyPermissions();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<TabKey>(getTabFromUrl);

  const handleTabChange = (value: string) => {
    setActiveTab(value as TabKey);
    setLocation(`/shifts?tab=${value}`);
  };

  const isSuperAdmin = myPerms?.isSuperAdmin ?? false;
  const myStaffId = myPerms?.staffId ?? null;
  const myLocationIds = useMemo(() => myPerms?.locationIds ?? [], [myPerms]);

  const getTabPerm = (tab: string) => myPerms?.permissions[`/shifts#${tab}`];

  const canAccessTab = (tab: string): boolean => {
    if (!myPerms) return true;
    if (isSuperAdmin) return true;
    const p = getTabPerm(tab);
    return !!(p?.canView || p?.canViewAll || p?.canCreate || p?.canEdit || p?.canDelete);
  };

  const shiftCan = {
    create: (tab: string) => isSuperAdmin || !!(getTabPerm(tab)?.canCreate),
    edit:   (tab: string) => isSuperAdmin || !!(getTabPerm(tab)?.canEdit),
    delete: (tab: string) => isSuperAdmin || !!(getTabPerm(tab)?.canDelete),
    viewAll:(tab: string) => isSuperAdmin || !!(getTabPerm(tab)?.canViewAll),
  };

  const visibleTabs = tabs.filter(t => isSubTabVisible("/shifts", t.key) && canAccessTab(t.key));

  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.find(t => t.key === activeTab)) {
      setActiveTab(visibleTabs[0].key);
    }
  }, [visibleTabs.map(t => t.key).join(","), activeTab]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [filters, setFilters] = useState({
    locationId: "all",
    teacherId: "all",
    weekday: "all",
  });

  const { data: locations = [] } = useQuery<any[]>({
    queryKey: ["/api/locations"],
  });

  const { data: staff = [] } = useQuery<any[]>({
    queryKey: ["/api/staff", "minimal", filters.locationId !== "all" ? filters.locationId : undefined],
    queryFn: async () => {
      const params = new URLSearchParams({ minimal: "true" });
      if (filters.locationId !== "all") params.append("locationId", filters.locationId);
      const res = await fetch(`/api/staff?${params.toString()}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: true,
  });

  const teachers = staff.filter((s: any) =>
    s.roleNames?.some((r: string) => r.toLowerCase().includes("giáo viên") || r.toLowerCase().includes("teacher"))
  );

  const { data: shiftTemplates = [] } = useQuery<any[]>({
    queryKey: ["/api/shift-templates", "work", filters.locationId !== "all" ? filters.locationId : undefined],
    queryFn: async () => {
      const params = new URLSearchParams({ type: "work" });
      if (filters.locationId !== "all") params.append("locationId", filters.locationId);
      const res = await fetch(`/api/shift-templates?${params.toString()}`);
      return res.json();
    },
  });

  const { data: availabilities = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/teacher-availability", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.locationId !== "all") params.append("locationId", filters.locationId);
      if (filters.teacherId !== "all") params.append("teacherId", filters.teacherId);
      if (filters.weekday !== "all") params.append("weekday", filters.weekday);
      const res = await fetch(`/api/teacher-availability?${params.toString()}`);
      return res.json();
    }
  });

  const filteredAvailabilities = useMemo(() => {
    if (!myPerms || isSuperAdmin) return availabilities;
    const p = getTabPerm("register");
    if (!p) return [];
    let data = Array.isArray(availabilities) ? [...availabilities] : [];
    if (myLocationIds.length > 0) data = data.filter((item: any) => myLocationIds.includes(item.locationId));
    if (!p.canViewAll && p.canView) data = data.filter((item: any) => item.teacherId === myStaffId);
    return data;
  }, [availabilities, myPerms, isSuperAdmin, myStaffId, myLocationIds]);

  const createMutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      await apiRequest("POST", "/api/teacher-availability", values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teacher-availability"] });
      toast({ title: "Thành công", description: "Đã đăng ký ca dạy mới" });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể đăng ký ca dạy",
        variant: "destructive"
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/teacher-availability/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teacher-availability"] });
      toast({ title: "Thành công", description: "Đã xoá đăng ký" });
    }
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      locationId: "",
      teacherId: "",
      shiftTemplateId: "",
      weekdays: [],
      effectiveFrom: format(new Date(), "yyyy-MM-dd"),
    },
  });

  const selectedLocationId = form.watch("locationId");
  const filteredTeachersForForm = staff.filter((s: any) =>
    s.assignments?.some((a: any) => a.locationId === selectedLocationId)
  );
  const filteredShiftsForForm = shiftTemplates.filter((s: any) => s.locationId === selectedLocationId);

  // === Cấu hình ca làm việc ===
  const [configLocationFilter, setConfigLocationFilter] = useState<string>("all");
  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);

  // Auto-restrict config location to user's primary location if not superAdmin
  useEffect(() => {
    if (!isSuperAdmin && myLocationIds.length > 0 && configLocationFilter === "all") {
      setConfigLocationFilter(myLocationIds[0]);
    }
  }, [isSuperAdmin, myLocationIds.join(",")]);
  const [editingShift, setEditingShift] = useState<any | null>(null);

  const { data: allShiftTemplates = [], isLoading: isShiftsLoading } = useQuery<any[]>({
    queryKey: ["/api/shift-templates", "work", configLocationFilter !== "all" ? configLocationFilter : undefined, "config"],
    queryFn: async () => {
      const params = new URLSearchParams({ type: "work" });
      if (configLocationFilter !== "all") params.append("locationId", configLocationFilter);
      const res = await fetch(`/api/shift-templates?${params.toString()}`);
      return res.json();
    },
  });

  const filteredConfigShifts = useMemo(() => {
    if (!myPerms || isSuperAdmin) return allShiftTemplates;
    const p = getTabPerm("config");
    if (!p) return [];
    let data = Array.isArray(allShiftTemplates) ? [...allShiftTemplates] : [];
    if (myLocationIds.length > 0) data = data.filter((s: any) => myLocationIds.includes(s.locationId));
    return data;
  }, [allShiftTemplates, myPerms, isSuperAdmin, myLocationIds]);

  const shiftForm = useForm<z.infer<typeof shiftConfigSchema>>({
    resolver: zodResolver(shiftConfigSchema),
    defaultValues: {
      locationId: "",
      code: "",
      name: "",
      startTime: "08:00",
      endTime: "17:00",
      lunchBreakMinutes: 60,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      workUnits: 1,
      status: "active",
      note: "",
    },
  });

  const openCreateShift = () => {
    setEditingShift(null);
    shiftForm.reset({
      locationId: configLocationFilter !== "all" ? configLocationFilter : "",
      code: "",
      name: "",
      startTime: "08:00",
      endTime: "17:00",
      lunchBreakMinutes: 60,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      workUnits: 1,
      status: "active",
      note: "",
    });
    setShiftDialogOpen(true);
  };

  const openEditShift = (s: any) => {
    setEditingShift(s);
    shiftForm.reset({
      locationId: s.locationId,
      code: s.code ?? "",
      name: s.name ?? "",
      startTime: s.startTime ?? "",
      endTime: s.endTime ?? "",
      lunchBreakMinutes: Number(s.lunchBreakMinutes ?? 0),
      lateMinutes: Number(s.lateMinutes ?? 0),
      earlyLeaveMinutes: Number(s.earlyLeaveMinutes ?? 0),
      workUnits: Number(s.workUnits ?? 1),
      status: (s.status as any) ?? "active",
      note: s.note ?? "",
    });
    setShiftDialogOpen(true);
  };

  const saveShiftMutation = useMutation({
    mutationFn: async (values: z.infer<typeof shiftConfigSchema>) => {
      const payload = { ...values, workUnits: String(values.workUnits), type: "work" };
      if (editingShift) {
        return apiRequest("PUT", `/api/shift-templates/${editingShift.id}`, payload);
      }
      return apiRequest("POST", "/api/shift-templates", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shift-templates", "work"] });
      toast({ title: "Thành công", description: editingShift ? "Đã cập nhật ca làm việc" : "Đã tạo ca làm việc mới" });
      setShiftDialogOpen(false);
      setEditingShift(null);
    },
    onError: async (error: any) => {
      let msg = "Không thể lưu ca làm việc";
      try {
        const data = await error?.response?.json?.();
        if (data?.message) msg = data.message;
      } catch {}
      if (error?.message && error.message !== "Failed to fetch") msg = error.message;
      toast({ title: "Lỗi", description: msg, variant: "destructive" });
    },
  });

  const deleteShiftMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/shift-templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shift-templates", "work"] });
      toast({ title: "Thành công", description: "Đã xoá ca làm việc" });
    },
  });

  const watchedStart = shiftForm.watch("startTime");
  const watchedEnd = shiftForm.watch("endTime");
  const watchedLunch = shiftForm.watch("lunchBreakMinutes");
  const previewTotal = calcTotalHours(watchedStart, watchedEnd, Number(watchedLunch || 0));

  // === Phân ca làm việc (Shift Assignments) ===
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<any | null>(null);
  const [isCopyingAssignment, setIsCopyingAssignment] = useState(false);

  const { data: shiftAssignments = [], isLoading: isAssignmentsLoading } = useQuery<any[]>({
    queryKey: ["/api/shift-assignments"],
  });

  const filteredAssignments = useMemo(() => {
    if (!myPerms || isSuperAdmin) return shiftAssignments;
    const p = getTabPerm("assign");
    if (!p) return [];
    let data = Array.isArray(shiftAssignments) ? [...shiftAssignments] : [];
    if (myLocationIds.length > 0) data = data.filter((a: any) => myLocationIds.includes(a.locationId));
    if (!p.canViewAll && p.canView) data = data.filter((a: any) => a.targetType === "staff" && a.targetId === myStaffId);
    return data;
  }, [shiftAssignments, myPerms, isSuperAdmin, myStaffId, myLocationIds]);

  const { data: departments = [] } = useQuery<any[]>({
    queryKey: ["/api/departments"],
  });

  const emptyWeekdaySchedule: Record<string, string[]> = { "1": [], "2": [], "3": [], "4": [], "5": [], "6": [], "0": [] };

  const assignForm = useForm<z.infer<typeof shiftAssignmentSchema>>({
    resolver: zodResolver(shiftAssignmentSchema),
    defaultValues: {
      name: "",
      locationId: "",
      targetType: "department",
      targetId: "",
      byWeekday: true,
      weekdaySchedule: emptyWeekdaySchedule,
      shiftTemplateId: "",
      effectiveFrom: format(new Date(), "yyyy-MM-dd"),
      effectiveTo: "",
    },
  });

  const assignLocationId = assignForm.watch("locationId");
  const assignTargetType = assignForm.watch("targetType");
  const assignByWeekday = assignForm.watch("byWeekday");
  const assignWeekdaySchedule = assignForm.watch("weekdaySchedule") || emptyWeekdaySchedule;

  const allRoles = departments.flatMap((d: any) =>
    (d.roles || []).map((r: any) => ({ ...r, departmentName: d.name }))
  );

  const assignTargetOptions = (() => {
    if (assignTargetType === "department") {
      return departments.map((d: any) => ({ value: d.id, label: d.name }));
    }
    if (assignTargetType === "role") {
      return allRoles.map((r: any) => ({ value: r.id, label: `${r.name} (${r.departmentName})` }));
    }
    const filtered = assignLocationId
      ? staff.filter((s: any) => s.assignments?.some((a: any) => a.locationId === assignLocationId))
      : staff;
    return filtered.map((s: any) => ({ value: s.id, label: s.fullName }));
  })();

  const shiftsForAssignLocation = Array.isArray(allShiftTemplates)
    ? allShiftTemplates.filter((s: any) => !assignLocationId || s.locationId === assignLocationId)
    : [];

  const shiftMultiOptions = shiftsForAssignLocation.map((s: any) => ({
    value: s.id,
    label: s.code ? `${s.code} - ${s.name}` : s.name,
  }));

  const openCreateAssignment = () => {
    setEditingAssignment(null);
    setIsCopyingAssignment(false);
    assignForm.reset({
      name: "",
      locationId: "",
      targetType: "department",
      targetId: "",
      byWeekday: true,
      weekdaySchedule: { ...emptyWeekdaySchedule },
      shiftTemplateId: "",
      effectiveFrom: format(new Date(), "yyyy-MM-dd"),
      effectiveTo: "",
    });
    setAssignDialogOpen(true);
  };

  const openEditAssignment = (a: any) => {
    setEditingAssignment(a);
    setIsCopyingAssignment(false);
    assignForm.reset({
      name: a.name ?? "",
      locationId: a.locationId ?? "",
      targetType: (a.targetType as any) ?? "department",
      targetId: a.targetId ?? "",
      byWeekday: a.byWeekday ?? true,
      weekdaySchedule: a.weekdaySchedule ?? { ...emptyWeekdaySchedule },
      shiftTemplateId: a.shiftTemplateId ?? "",
      effectiveFrom: a.effectiveFrom ?? "",
      effectiveTo: a.effectiveTo ?? "",
    });
    setAssignDialogOpen(true);
  };

  const openCopyAssignment = (a: any) => {
    // Keep editingAssignment empty so saving the copy always creates a new row.
    setEditingAssignment(null);
    setIsCopyingAssignment(true);
    assignForm.reset({
      name: `${a.name ?? "Phân ca"} - Bản sao`,
      locationId: a.locationId ?? "",
      targetType: (a.targetType as any) ?? "department",
      targetId: a.targetId ?? "",
      byWeekday: a.byWeekday ?? true,
      weekdaySchedule: a.weekdaySchedule
        ? Object.fromEntries(
            Object.entries(a.weekdaySchedule).map(([day, shiftIds]) => [day, [...(shiftIds as string[])]])
          )
        : { ...emptyWeekdaySchedule },
      shiftTemplateId: a.shiftTemplateId ?? "",
      effectiveFrom: a.effectiveFrom ?? "",
      effectiveTo: a.effectiveTo ?? "",
    });
    setAssignDialogOpen(true);
  };

  const saveAssignmentMutation = useMutation({
    mutationFn: async (values: z.infer<typeof shiftAssignmentSchema>) => {
      const payload: any = {
        ...values,
        shiftTemplateId: values.byWeekday ? null : (values.shiftTemplateId || null),
        weekdaySchedule: values.byWeekday ? values.weekdaySchedule : null,
        effectiveFrom: values.effectiveFrom || null,
        effectiveTo: values.effectiveTo || null,
      };
      if (editingAssignment) {
        return apiRequest("PUT", `/api/shift-assignments/${editingAssignment.id}`, payload);
      }
      return apiRequest("POST", "/api/shift-assignments", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shift-assignments"] });
      toast({
        title: "Thành công",
        description: editingAssignment
          ? "Đã cập nhật phân ca"
          : isCopyingAssignment
            ? "Đã sao chép phân ca"
            : "Đã tạo phân ca mới",
      });
      setAssignDialogOpen(false);
      setEditingAssignment(null);
      setIsCopyingAssignment(false);
    },
    onError: (error: any) => {
      toast({ title: "Lỗi", description: error?.message || "Không thể lưu phân ca", variant: "destructive" });
    },
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/shift-assignments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shift-assignments"] });
      toast({ title: "Thành công", description: "Đã xoá phân ca" });
    },
  });

  const targetTypeLabel: Record<string, string> = {
    department: "Phòng ban",
    role: "Vai trò",
    staff: "Nhân viên",
  };

  const weekdayShortLabel: Record<string, string> = {
    "1": "T2", "2": "T3", "3": "T4", "4": "T5", "5": "T6", "6": "T7", "0": "CN",
  };

  const formatScheduleSummary = (a: any) => {
    if (!a.byWeekday) {
      const tpl = Array.isArray(allShiftTemplates) ? allShiftTemplates.find((s: any) => s.id === a.shiftTemplateId) : null;
      return tpl ? (tpl.code || tpl.name) : "—";
    }
    const sched = a.weekdaySchedule || {};
    const order = ["1", "2", "3", "4", "5", "6", "0"];
    const parts: string[] = [];
    for (const k of order) {
      const ids = sched[k] || [];
      if (ids.length === 0) continue;
      const names = ids.map((id: string) => {
        const tpl = Array.isArray(allShiftTemplates) ? allShiftTemplates.find((s: any) => s.id === id) : null;
        return tpl ? (tpl.code || tpl.name) : "?";
      });
      parts.push(`${weekdayShortLabel[k]}: ${names.join(", ")}`);
    }
    return parts.length > 0 ? parts.join(" | ") : "—";
  };

  const getTargetName = (a: any) => {
    if (a.targetType === "department") return departments.find((d: any) => d.id === a.targetId)?.name || "—";
    if (a.targetType === "role") return allRoles.find((r: any) => r.id === a.targetId)?.name || "—";
    return staff.find((s: any) => s.id === a.targetId)?.fullName || "—";
  };

  const getLocationName = (id: string) => locations.find((l: any) => l.id === id)?.name || "—";

  // === Bảng phân ca (Schedule Board) ===
  const today = new Date();
  const [boardYear, setBoardYear] = useState<number>(today.getFullYear());
  const [boardMonth, setBoardMonth] = useState<number>(today.getMonth() + 1); // 1-12
  const [boardLocationId, setBoardLocationId] = useState<string>("all");
  const [boardPage, setBoardPage] = useState<number>(1);
  const [boardPageSize, setBoardPageSize] = useState<number>(10);

  // Auto-restrict board location to user's primary location if not superAdmin
  useEffect(() => {
    if (!isSuperAdmin && myLocationIds.length > 0 && boardLocationId === "all") {
      setBoardLocationId(myLocationIds[0]);
    }
  }, [isSuperAdmin, myLocationIds.join(",")]);

  const daysInBoardMonth = new Date(boardYear, boardMonth, 0).getDate();
  const boardDays = Array.from({ length: daysInBoardMonth }, (_, i) => {
    const d = new Date(boardYear, boardMonth - 1, i + 1);
    const dow = d.getDay(); // 0=Sun..6=Sat
    return { date: d, day: i + 1, dow, key: String(dow), isWeekend: dow === 0 || dow === 6 };
  });
  const dayOfWeekShort: Record<number, string> = { 1: "T2", 2: "T3", 3: "T4", 4: "T5", 5: "T6", 6: "T7", 0: "CN" };

  const goPrevMonth = () => {
    if (boardMonth === 1) {
      setBoardMonth(12);
      setBoardYear((y) => y - 1);
    } else setBoardMonth((m) => m - 1);
  };
  const goNextMonth = () => {
    if (boardMonth === 12) {
      setBoardMonth(1);
      setBoardYear((y) => y + 1);
    } else setBoardMonth((m) => m + 1);
  };

  // Determine if a staff matches an assignment
  const staffMatchesAssignment = (s: any, a: any): boolean => {
    if (!a.targetId) return false;
    const sAssignments: any[] = s.assignments || [];
    if (a.targetType === "staff") return s.id === a.targetId;
    if (a.targetType === "department") {
      return sAssignments.some((sa) => sa.departmentId === a.targetId && (!a.locationId || sa.locationId === a.locationId));
    }
    if (a.targetType === "role") {
      return sAssignments.some((sa) => sa.roleId === a.targetId && (!a.locationId || sa.locationId === a.locationId));
    }
    return false;
  };

  // Get shift template IDs assigned to a staff member on a particular date
  const getShiftIdsForStaffOnDate = (s: any, date: Date): string[] => {
    const ymd = format(date, "yyyy-MM-dd");
    const dowKey = String(date.getDay());
    const ids: string[] = [];
    if (!Array.isArray(shiftAssignments)) return ids;
    for (const a of shiftAssignments as any[]) {
      if (!staffMatchesAssignment(s, a)) continue;
      if (a.effectiveFrom && ymd < format(new Date(a.effectiveFrom), "yyyy-MM-dd")) continue;
      if (a.effectiveTo && ymd > format(new Date(a.effectiveTo), "yyyy-MM-dd")) continue;
      if (a.byWeekday) {
        const list: string[] = (a.weekdaySchedule && a.weekdaySchedule[dowKey]) || [];
        for (const id of list) if (id && !ids.includes(id)) ids.push(id);
      } else if (a.shiftTemplateId) {
        if (!ids.includes(a.shiftTemplateId)) ids.push(a.shiftTemplateId);
      }
    }
    return ids;
  };

  // Calculate shift hours from a template
  const getShiftHours = (tpl: any): number => {
    if (!tpl) return 0;
    if (tpl.totalHours != null) return Number(tpl.totalHours) || 0;
    if (tpl.workUnits != null) return Number(tpl.workUnits) || 0;
    return calcTotalHours(tpl.startTime, tpl.endTime, Number(tpl.lunchBreakMinutes || 0));
  };

  // Filter staff by location
  const boardStaffAll = (Array.isArray(staff) ? staff : []).filter((s: any) => {
    if (boardLocationId === "all") return true;
    return (s.assignments || []).some((sa: any) => sa.locationId === boardLocationId);
  });

  // Build the board rows: only staff who have at least one shift assigned in the month
  const boardRowsAll = boardStaffAll
    .map((s: any) => {
      const perDay = boardDays.map((d) => getShiftIdsForStaffOnDate(s, d.date));
      const allIds = perDay.flat();
      const total = allIds.reduce((sum, id) => {
        const tpl = (allShiftTemplates as any[]).find((t: any) => t.id === id);
        return sum + getShiftHours(tpl);
      }, 0);
      return { staff: s, perDay, total, hasAny: allIds.length > 0 };
    })
    .filter((r) => r.hasAny);

  // Apply permission filter to board rows (canView = own row only)
  const boardRowsFiltered = useMemo(() => {
    if (!myPerms || isSuperAdmin) return boardRowsAll;
    const p = getTabPerm("board");
    if (!p) return [];
    if (!p.canViewAll && p.canView) return boardRowsAll.filter(r => r.staff.id === myStaffId);
    return boardRowsAll;
  }, [boardRowsAll, myPerms, isSuperAdmin, myStaffId]);

  const boardTotalRows = boardRowsFiltered.length;
  const boardTotalPages = Math.max(1, Math.ceil(boardTotalRows / boardPageSize));
  const boardPageSafe = Math.min(boardPage, boardTotalPages);
  const boardRows = boardRowsFiltered.slice((boardPageSafe - 1) * boardPageSize, boardPageSafe * boardPageSize);

  // Collect distinct shifts shown in the board for the legend
  const usedShiftIds = new Set<string>();
  for (const r of boardRowsFiltered) for (const ids of r.perDay) for (const id of ids) usedShiftIds.add(id);
  const legendShifts = (allShiftTemplates as any[]).filter((t: any) => usedShiftIds.has(t.id));

  // Color palette for shift code badges
  const shiftColorPalette = [
    "bg-blue-100 text-blue-700",
    "bg-emerald-100 text-emerald-700",
    "bg-amber-100 text-amber-700",
    "bg-rose-100 text-rose-700",
    "bg-violet-100 text-violet-700",
    "bg-cyan-100 text-cyan-700",
    "bg-fuchsia-100 text-fuchsia-700",
    "bg-orange-100 text-orange-700",
  ];
  const shiftColorMap: Record<string, string> = {};
  legendShifts.forEach((t: any, idx: number) => {
    shiftColorMap[t.id] = shiftColorPalette[idx % shiftColorPalette.length];
  });

  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);
  const yearOptions = Array.from({ length: 7 }, (_, i) => today.getFullYear() - 2 + i);

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Quản lý Ca làm việc</h1>
            <p className="text-muted-foreground mt-1">Quản lý đăng ký ca dạy và lịch làm việc của nhân sự</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <div className="flex flex-wrap gap-2">
            {visibleTabs.map((t) => {
              const Icon = t.icon;
              const isActive = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => handleTabChange(t.key)}
                  data-testid={`tab-${t.key}`}
                  className={cn(
                    "px-3 py-1.5 rounded-md border text-xs font-medium transition-all flex items-center gap-1.5",
                    isActive
                      ? "bg-primary border-primary text-primary-foreground"
                      : "bg-background border-border text-foreground hover:bg-accent"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>

          <TabsContent value="register">
            <div className="bg-white border border-border rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
              <Select value={filters.locationId} onValueChange={(v) => setFilters(f => ({ ...f, locationId: v }))}>
                <SelectTrigger data-testid="select-filter-location"><SelectValue placeholder="Cơ sở" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả cơ sở</SelectItem>
                  {locations.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={filters.teacherId} onValueChange={(v) => setFilters(f => ({ ...f, teacherId: v }))}>
                <SelectTrigger data-testid="select-filter-teacher"><SelectValue placeholder="Giáo viên" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả giáo viên</SelectItem>
                  {[...teachers].sort((a: any, b: any) => {
                    const aActive = a.status !== "Không hoạt động";
                    const bActive = b.status !== "Không hoạt động";
                    if (aActive === bActive) return 0;
                    return aActive ? -1 : 1;
                  }).map((t: any) => {
                    const isInactive = t.status === "Không hoạt động";
                    return (
                      <SelectItem key={t.id} value={t.id} disabled={isInactive} className={isInactive ? "opacity-40" : ""}>
                        <span className="flex items-center gap-1.5">
                          <span>{t.fullName}</span>
                          {isInactive && <span className="text-amber-500 text-[10px] font-medium">⚠ Không hoạt động</span>}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>

              <Select value={filters.weekday} onValueChange={(v) => setFilters(f => ({ ...f, weekday: v }))}>
                <SelectTrigger data-testid="select-filter-weekday"><SelectValue placeholder="Thứ" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả các thứ</SelectItem>
                  {weekdays.map(w => <SelectItem key={w.id} value={w.id.toString()}>{w.label}</SelectItem>)}
                </SelectContent>
              </Select>

              {shiftCan.create("register") && (
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2" data-testid="button-register-shift">
                    <Plus className="h-4 w-4" />
                    Đăng ký mới
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Đăng ký ca rảnh giáo viên</DialogTitle>
                  </DialogHeader>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
                      <FormField
                        control={form.control}
                        name="locationId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cơ sở</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger><SelectValue placeholder="Chọn cơ sở" /></SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {locations.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="teacherId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Giáo viên</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value} disabled={!selectedLocationId}>
                              <FormControl>
                                <SelectTrigger><SelectValue placeholder="Chọn giáo viên" /></SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {[...filteredTeachersForForm].sort((a: any, b: any) => {
                                  const aActive = a.status !== "Không hoạt động";
                                  const bActive = b.status !== "Không hoạt động";
                                  if (aActive === bActive) return 0;
                                  return aActive ? -1 : 1;
                                }).map((t: any) => {
                                  const isInactive = t.status === "Không hoạt động";
                                  return (
                                    <SelectItem key={t.id} value={t.id} disabled={isInactive} className={isInactive ? "opacity-40" : ""}>
                                      <span className="flex items-center gap-1.5">
                                        <span>{t.fullName}</span>
                                        {isInactive && <span className="text-amber-500 text-[10px] font-medium">⚠ Không hoạt động</span>}
                                      </span>
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="shiftTemplateId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Ca học</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value} disabled={!selectedLocationId}>
                              <FormControl>
                                <SelectTrigger><SelectValue placeholder="Chọn ca" /></SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {filteredShiftsForForm.map((s: any) => (
                                  <SelectItem key={s.id} value={s.id}>{s.name} ({s.startTime} - {s.endTime})</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="weekdays"
                        render={() => (
                          <FormItem>
                            <FormLabel>Thứ trong tuần</FormLabel>
                            <div className="grid grid-cols-4 gap-2">
                              {weekdays.map((w) => (
                                <FormField
                                  key={w.id}
                                  control={form.control}
                                  name="weekdays"
                                  render={({ field }) => (
                                    <FormItem className="flex items-center space-x-2 space-y-0">
                                      <FormControl>
                                        <Checkbox
                                          checked={field.value?.includes(w.id)}
                                          onCheckedChange={(checked) => {
                                            return checked
                                              ? field.onChange([...field.value, w.id])
                                              : field.onChange(field.value?.filter((value) => value !== w.id));
                                          }}
                                        />
                                      </FormControl>
                                      <FormLabel className="text-xs font-normal cursor-pointer">{w.label}</FormLabel>
                                    </FormItem>
                                  )}
                                />
                              ))}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="effectiveFrom"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Từ ngày</FormLabel>
                              <FormControl><Input type="date" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="effectiveTo"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Đến ngày</FormLabel>
                              <FormControl><Input type="date" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <DialogFooter>
                        <Button type="submit" disabled={createMutation.isPending}>
                          {createMutation.isPending ? "Đang lưu..." : "Lưu đăng ký"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
              )}
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Giáo viên</TableHead>
                      <TableHead>Cơ sở</TableHead>
                      <TableHead>Thứ</TableHead>
                      <TableHead>Ca</TableHead>
                      <TableHead>Hiệu lực</TableHead>
                      {shiftCan.delete("register") && <TableHead className="text-right">Thao tác</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8">Đang tải...</TableCell></TableRow>
                    ) : filteredAvailabilities.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Không tìm thấy đăng ký nào.</TableCell></TableRow>
                    ) : (
                      filteredAvailabilities.map((item: any) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.teacher?.fullName}</TableCell>
                          <TableCell>{item.location?.name}</TableCell>
                          <TableCell>{weekdays.find(w => w.id === item.weekday)?.label}</TableCell>
                          <TableCell>
                            <div>{item.shiftTemplate?.name}</div>
                            <div className="text-xs text-muted-foreground">{item.shiftTemplate?.startTime} - {item.shiftTemplate?.endTime}</div>
                          </TableCell>
                          <TableCell>
                            <div className="text-xs">
                              {item.effectiveFrom ? format(new Date(item.effectiveFrom), "dd/MM/yyyy") : "---"}
                              {" → "}
                              {item.effectiveTo ? format(new Date(item.effectiveTo), "dd/MM/yyyy") : "Không thời hạn"}
                            </div>
                          </TableCell>
                          {shiftCan.delete("register") && (
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              data-testid={`button-delete-availability-${item.id}`}
                              onClick={() => {
                                if (confirm("Bạn có chắc chắn muốn xoá đăng ký này?")) {
                                  deleteMutation.mutate(item.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                          )}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="board">
            <Card>
              <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarRange className="h-5 w-5" />
                    Bảng phân ca
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Xem lịch phân ca của nhân viên theo tháng
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={boardLocationId} onValueChange={(v) => { setBoardLocationId(v); setBoardPage(1); }}>
                    <SelectTrigger className="w-[180px]" data-testid="select-board-location">
                      <SelectValue placeholder="Cơ sở" />
                    </SelectTrigger>
                    <SelectContent>
                      {(isSuperAdmin || myLocationIds.length === 0) && (
                        <SelectItem value="all">Tất cả cơ sở</SelectItem>
                      )}
                      {locations
                        .filter((l: any) => isSuperAdmin || myLocationIds.length === 0 || myLocationIds.includes(l.id))
                        .map((l: any) => (
                          <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="icon" onClick={goPrevMonth} data-testid="button-prev-month">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Select value={String(boardMonth)} onValueChange={(v) => setBoardMonth(Number(v))}>
                    <SelectTrigger className="w-[110px]" data-testid="select-board-month">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {monthOptions.map((m) => (
                        <SelectItem key={m} value={String(m)}>Tháng {m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={String(boardYear)} onValueChange={(v) => setBoardYear(Number(v))}>
                    <SelectTrigger className="w-[100px]" data-testid="select-board-year">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {yearOptions.map((y) => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="icon" onClick={goNextMonth} data-testid="button-next-month">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="sticky left-0 bg-background min-w-[180px] z-10">
                          Nhân viên
                        </TableHead>
                        {boardDays.map((d) => (
                          <TableHead
                            key={d.day}
                            className={cn(
                              "text-center min-w-[56px] px-1",
                              d.isWeekend && "bg-orange-50 text-orange-700"
                            )}
                          >
                            <div className="text-xs font-normal">{dayOfWeekShort[d.dow]}</div>
                            <div className="text-sm font-semibold">{d.day}</div>
                          </TableHead>
                        ))}
                        <TableHead className="text-right sticky right-0 bg-background min-w-[100px] z-10">
                          Tổng công
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {boardRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={boardDays.length + 2} className="text-center py-12 text-muted-foreground">
                            Chưa có nhân viên nào được phân ca trong tháng này.
                          </TableCell>
                        </TableRow>
                      ) : (
                        boardRows.map((r) => (
                          <TableRow key={r.staff.id} data-testid={`row-board-${r.staff.id}`}>
                            <TableCell className="sticky left-0 bg-background font-medium z-10">
                              <div className="text-sm">{r.staff.fullName || r.staff.code}</div>
                              {r.staff.code && (
                                <div className="text-xs text-muted-foreground">{r.staff.code}</div>
                              )}
                            </TableCell>
                            {r.perDay.map((ids, idx) => (
                              <TableCell
                                key={idx}
                                className={cn(
                                  "text-center px-1 align-middle",
                                  boardDays[idx].isWeekend && "bg-orange-50/50"
                                )}
                              >
                                <div className="flex flex-wrap gap-0.5 justify-center">
                                  {ids.map((id) => {
                                    const tpl = (allShiftTemplates as any[]).find((t: any) => t.id === id);
                                    if (!tpl) return null;
                                    return (
                                      <span
                                        key={id}
                                        className={cn(
                                          "inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium",
                                          shiftColorMap[id] || "bg-slate-100 text-slate-700"
                                        )}
                                        title={`${tpl.name} (${tpl.startTime || ""} - ${tpl.endTime || ""})`}
                                      >
                                        {tpl.code || tpl.name}
                                      </span>
                                    );
                                  })}
                                </div>
                              </TableCell>
                            ))}
                            <TableCell className="sticky right-0 bg-background text-right font-semibold z-10">
                              {r.total.toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {legendShifts.length > 0 && (
                  <div className="px-6 py-4 border-t flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                    <span className="font-medium text-muted-foreground">Chú thích:</span>
                    {legendShifts.map((tpl: any) => (
                      <div key={tpl.id} className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium",
                            shiftColorMap[tpl.id] || "bg-slate-100 text-slate-700"
                          )}
                        >
                          {tpl.code || tpl.name}
                        </span>
                        <span className="text-muted-foreground">
                          = {tpl.name}
                          {tpl.startTime && tpl.endTime ? ` (${tpl.startTime} - ${tpl.endTime})` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="px-6 py-3 border-t flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span>Hiển thị</span>
                    <Select value={String(boardPageSize)} onValueChange={(v) => { setBoardPageSize(Number(v)); setBoardPage(1); }}>
                      <SelectTrigger className="w-[80px] h-8" data-testid="select-board-page-size">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                      </SelectContent>
                    </Select>
                    <span>bản ghi</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={boardPageSafe <= 1}
                      onClick={() => setBoardPage((p) => Math.max(1, p - 1))}
                      data-testid="button-prev-page"
                    >
                      Trước
                    </Button>
                    <span className="text-muted-foreground">
                      Trang {boardPageSafe} / {boardTotalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={boardPageSafe >= boardTotalPages}
                      onClick={() => setBoardPage((p) => Math.min(boardTotalPages, p + 1))}
                      data-testid="button-next-page"
                    >
                      Sau
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="assign">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <ClipboardList className="h-5 w-5" />
                    Phân ca làm việc
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Gán ca làm việc cho phòng ban, vai trò hoặc nhân viên
                  </p>
                </div>
                {shiftCan.create("assign") && (
                  <Button onClick={openCreateAssignment} className="gap-2" data-testid="button-add-assignment">
                    <Plus className="h-4 w-4" />
                    Thêm phân ca
                  </Button>
                )}
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tên phân ca</TableHead>
                      <TableHead>Loại đối tượng</TableHead>
                      <TableHead>Tên đối tượng</TableHead>
                      <TableHead>Cơ sở</TableHead>
                      <TableHead>Ca làm việc</TableHead>
                      <TableHead>Lịch theo thứ</TableHead>
                      <TableHead>Từ ngày</TableHead>
                      <TableHead>Đến ngày</TableHead>
                      {(shiftCan.create("assign") || shiftCan.edit("assign") || shiftCan.delete("assign")) && <TableHead className="text-right">Thao tác</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isAssignmentsLoading ? (
                      <TableRow><TableCell colSpan={9} className="text-center py-8">Đang tải...</TableCell></TableRow>
                    ) : filteredAssignments.length === 0 ? (
                      <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Chưa có phân ca nào.</TableCell></TableRow>
                    ) : (
                      filteredAssignments.map((a: any) => {
                        const tpl = !a.byWeekday && Array.isArray(allShiftTemplates)
                          ? allShiftTemplates.find((s: any) => s.id === a.shiftTemplateId)
                          : null;
                        const hasActions = shiftCan.create("assign") || shiftCan.edit("assign") || shiftCan.delete("assign");
                        return (
                          <TableRow key={a.id} data-testid={`row-assignment-${a.id}`}>
                            <TableCell className="font-medium" data-testid={`text-assignment-name-${a.id}`}>{a.name}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="bg-violet-100 text-violet-700 hover:bg-violet-100 border-0">
                                {targetTypeLabel[a.targetType] || a.targetType}
                              </Badge>
                            </TableCell>
                            <TableCell>{getTargetName(a)}</TableCell>
                            <TableCell>{getLocationName(a.locationId)}</TableCell>
                            <TableCell>{tpl ? (tpl.code || tpl.name) : "—"}</TableCell>
                            <TableCell className="max-w-[280px] truncate" title={formatScheduleSummary(a)}>
                              {a.byWeekday ? formatScheduleSummary(a) : "—"}
                            </TableCell>
                            <TableCell>{a.effectiveFrom ? format(new Date(a.effectiveFrom), "yyyy-MM-dd") : "—"}</TableCell>
                            <TableCell>{a.effectiveTo ? format(new Date(a.effectiveTo), "yyyy-MM-dd") : "—"}</TableCell>
                            {hasActions && (
                            <TableCell className="text-right">
                              {shiftCan.create("assign") && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openCopyAssignment(a)}
                                aria-label="Sao chép phân ca"
                                title="Sao chép phân ca"
                                data-testid={`button-copy-assignment-${a.id}`}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              )}
                              {shiftCan.edit("assign") && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditAssignment(a)}
                                data-testid={`button-edit-assignment-${a.id}`}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              )}
                              {shiftCan.delete("assign") && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => {
                                  if (confirm("Bạn có chắc chắn muốn xoá phân ca này?")) {
                                    deleteAssignmentMutation.mutate(a.id);
                                  }
                                }}
                                data-testid={`button-delete-assignment-${a.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                              )}
                            </TableCell>
                            )}
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {editingAssignment ? "Sửa phân ca" : isCopyingAssignment ? "Sao chép phân ca" : "Thêm phân ca"}
                  </DialogTitle>
                  <p className="text-sm text-muted-foreground">Cập nhật thông tin phân ca</p>
                </DialogHeader>
                <Form {...assignForm}>
                  <form onSubmit={assignForm.handleSubmit((v) => saveAssignmentMutation.mutate(v))} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={assignForm.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tên phân ca</FormLabel>
                            <FormControl><Input {...field} placeholder="VD: Phân ca LV" data-testid="input-assignment-name" /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={assignForm.control}
                        name="locationId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cơ sở</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-assignment-location"><SelectValue placeholder="Chọn cơ sở" /></SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {locations.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={assignForm.control}
                      name="targetType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Loại đối tượng</FormLabel>
                          <Select
                            onValueChange={(v) => {
                              field.onChange(v);
                              assignForm.setValue("targetId", "");
                            }}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-assignment-target-type"><SelectValue /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="department">Phòng ban</SelectItem>
                              <SelectItem value="role">Vai trò</SelectItem>
                              <SelectItem value="staff">Nhân viên</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={assignForm.control}
                      name="targetId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Đối tượng</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-assignment-target"><SelectValue placeholder="Chọn đối tượng" /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {assignTargetOptions.length === 0 ? (
                                <div className="px-2 py-1.5 text-sm text-muted-foreground">Không có đối tượng</div>
                              ) : (
                                assignTargetOptions.map((o) => (
                                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={assignForm.control}
                      name="byWeekday"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-by-weekday"
                            />
                          </FormControl>
                          <FormLabel className="cursor-pointer text-sm font-medium">
                            Phân ca theo ngày trong tuần (T2-CN)
                          </FormLabel>
                        </FormItem>
                      )}
                    />

                    {assignByWeekday ? (
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Lịch ca theo từng thứ</div>
                        <div className="space-y-2 max-h-[300px] overflow-y-auto rounded-md border p-3">
                          {[
                            { key: "1", label: "Thứ hai" },
                            { key: "2", label: "Thứ ba" },
                            { key: "3", label: "Thứ tư" },
                            { key: "4", label: "Thứ năm" },
                            { key: "5", label: "Thứ sáu" },
                            { key: "6", label: "Thứ bảy" },
                            { key: "0", label: "Chủ nhật" },
                          ].map((d) => (
                            <div key={d.key} className="grid grid-cols-[100px_1fr] gap-3 items-center">
                              <div className="text-sm text-muted-foreground">{d.label}</div>
                              <MultiSelect
                                key={`${d.key}-${editingAssignment?.id || "new"}-${assignLocationId}`}
                                options={shiftMultiOptions}
                                defaultValue={assignWeekdaySchedule[d.key] || []}
                                onValueChange={(vals) => {
                                  const next = { ...(assignForm.getValues("weekdaySchedule") || emptyWeekdaySchedule), [d.key]: vals };
                                  assignForm.setValue("weekdaySchedule", next, { shouldDirty: true });
                                }}
                                placeholder={assignLocationId ? "Chọn ca làm việc" : "Hãy chọn cơ sở trước"}
                                maxCount={5}
                                modalPopover
                                data-testid={`multi-shift-${d.key}`}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <FormField
                        control={assignForm.control}
                        name="shiftTemplateId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Ca làm việc</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ""}>
                              <FormControl>
                                <SelectTrigger data-testid="select-assignment-shift"><SelectValue placeholder="Chọn ca" /></SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {shiftsForAssignLocation.map((s: any) => (
                                  <SelectItem key={s.id} value={s.id}>{s.code ? `${s.code} - ${s.name}` : s.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={assignForm.control}
                        name="effectiveFrom"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Từ ngày</FormLabel>
                            <FormControl><Input type="date" {...field} data-testid="input-assignment-from" /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={assignForm.control}
                        name="effectiveTo"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Đến ngày</FormLabel>
                            <FormControl><Input type="date" {...field} data-testid="input-assignment-to" /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setAssignDialogOpen(false)} data-testid="button-cancel-assignment">
                        Huỷ
                      </Button>
                      <Button type="submit" disabled={saveAssignmentMutation.isPending} data-testid="button-save-assignment">
                        {saveAssignmentMutation.isPending
                          ? "Đang lưu..."
                          : (editingAssignment ? "Cập nhật" : isCopyingAssignment ? "Sao chép" : "Tạo mới")}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="config">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Danh sách ca làm việc
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Quản lý các ca làm việc trong tổ chức
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={configLocationFilter} onValueChange={setConfigLocationFilter}>
                    <SelectTrigger className="w-[200px]" data-testid="select-config-location">
                      <SelectValue placeholder="Cơ sở" />
                    </SelectTrigger>
                    <SelectContent>
                      {(isSuperAdmin || myLocationIds.length === 0) && (
                        <SelectItem value="all">Tất cả cơ sở</SelectItem>
                      )}
                      {locations
                        .filter((l: any) => isSuperAdmin || myLocationIds.length === 0 || myLocationIds.includes(l.id))
                        .map((l: any) => (
                          <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {shiftCan.create("config") && (
                    <Button onClick={openCreateShift} className="gap-2" data-testid="button-add-shift">
                      <Plus className="h-4 w-4" />
                      Thêm ca làm việc
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mã ca</TableHead>
                      <TableHead>Tên ca</TableHead>
                      <TableHead>Giờ bắt đầu</TableHead>
                      <TableHead>Giờ kết thúc</TableHead>
                      <TableHead>Nghỉ trưa (phút)</TableHead>
                      <TableHead>Tổng giờ</TableHead>
                      <TableHead>Số công</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      {(shiftCan.edit("config") || shiftCan.delete("config")) && <TableHead className="text-right">Thao tác</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isShiftsLoading ? (
                      <TableRow><TableCell colSpan={9} className="text-center py-8">Đang tải...</TableCell></TableRow>
                    ) : filteredConfigShifts.length === 0 ? (
                      <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Chưa có ca làm việc nào.</TableCell></TableRow>
                    ) : (
                      filteredConfigShifts.map((s: any) => {
                        const total = calcTotalHours(s.startTime, s.endTime, Number(s.lunchBreakMinutes ?? 0));
                        const hasActions = shiftCan.edit("config") || shiftCan.delete("config");
                        return (
                          <TableRow key={s.id} data-testid={`row-shift-${s.id}`}>
                            <TableCell className="font-medium" data-testid={`text-shift-code-${s.id}`}>{s.code || "—"}</TableCell>
                            <TableCell data-testid={`text-shift-name-${s.id}`}>{s.name}</TableCell>
                            <TableCell>{s.startTime}</TableCell>
                            <TableCell>{s.endTime}</TableCell>
                            <TableCell>{Number(s.lunchBreakMinutes ?? 0)}</TableCell>
                            <TableCell>{total} giờ</TableCell>
                            <TableCell>
                              <span className="text-primary">{Number(s.workUnits ?? 1)} công</span>
                            </TableCell>
                            <TableCell>
                              <Badge variant={s.status === "active" ? "default" : "secondary"} className={cn(s.status === "active" && "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300")}>
                                {s.status === "active" ? "Hoạt động" : "Tạm ngưng"}
                              </Badge>
                            </TableCell>
                            {hasActions && (
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {shiftCan.edit("config") && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  data-testid={`button-edit-shift-${s.id}`}
                                  onClick={() => openEditShift(s)}
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                )}
                                {shiftCan.delete("config") && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                  data-testid={`button-delete-shift-${s.id}`}
                                  onClick={() => {
                                    if (confirm(`Xoá ca "${s.name}"?`)) {
                                      deleteShiftMutation.mutate(s.id);
                                    }
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                                )}
                              </div>
                            </TableCell>
                            )}
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Shift config dialog */}
        <Dialog open={shiftDialogOpen} onOpenChange={setShiftDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingShift ? "Sửa ca làm việc" : "Thêm ca làm việc"}</DialogTitle>
            </DialogHeader>
            <Form {...shiftForm}>
              <form
                onSubmit={shiftForm.handleSubmit((v) => saveShiftMutation.mutate(v))}
                className="space-y-4"
              >
                <FormField
                  control={shiftForm.control}
                  name="locationId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cơ sở</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-shift-location"><SelectValue placeholder="Chọn cơ sở" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {locations.map((l: any) => (
                            <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={shiftForm.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mã ca</FormLabel>
                        <FormControl><Input placeholder="VD: CC, CS, Full" {...field} data-testid="input-shift-code" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={shiftForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tên ca</FormLabel>
                        <FormControl><Input placeholder="Tên ca làm việc" {...field} data-testid="input-shift-name" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={shiftForm.control}
                    name="startTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Giờ bắt đầu</FormLabel>
                        <FormControl><Input type="time" {...field} data-testid="input-shift-start" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={shiftForm.control}
                    name="endTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Giờ kết thúc</FormLabel>
                        <FormControl><Input type="time" {...field} data-testid="input-shift-end" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={shiftForm.control}
                    name="lunchBreakMinutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nghỉ trưa (phút)</FormLabel>
                        <FormControl><Input type="number" min={0} {...field} data-testid="input-shift-lunch" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={shiftForm.control}
                    name="lateMinutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Đi muộn (phút)</FormLabel>
                        <FormControl><Input type="number" min={0} {...field} data-testid="input-shift-late" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={shiftForm.control}
                    name="earlyLeaveMinutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Về sớm (phút)</FormLabel>
                        <FormControl><Input type="number" min={0} {...field} data-testid="input-shift-early" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
                  <div className="grid grid-cols-2 gap-4 items-end">
                    <div>
                      <div className="text-sm font-medium text-primary">Tổng thời gian làm việc</div>
                      <div className="mt-1 text-2xl font-bold text-primary" data-testid="text-shift-total">
                        {previewTotal} giờ
                      </div>
                    </div>
                    <FormField
                      control={shiftForm.control}
                      name="workUnits"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-primary">Số công</FormLabel>
                          <div className="flex items-center gap-2">
                            <FormControl>
                              <Input
                                type="number"
                                min={0}
                                step="any"
                                className="w-24 bg-background"
                                {...field}
                                data-testid="input-shift-units"
                              />
                            </FormControl>
                            <span className="text-sm text-muted-foreground">công</span>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <FormField
                  control={shiftForm.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Trạng thái</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-shift-status"><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="active">Hoạt động</SelectItem>
                          <SelectItem value="inactive">Tạm ngưng</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={shiftForm.control}
                  name="note"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ghi chú</FormLabel>
                      <FormControl><Input placeholder="Tuỳ chọn" {...field} data-testid="input-shift-note" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setShiftDialogOpen(false)}>Huỷ</Button>
                  <Button type="submit" disabled={saveShiftMutation.isPending} data-testid="button-save-shift">
                    {saveShiftMutation.isPending ? "Đang lưu..." : (editingShift ? "Cập nhật" : "Tạo mới")}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
