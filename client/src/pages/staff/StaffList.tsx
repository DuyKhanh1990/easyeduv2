import { useState, useRef, useMemo, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageGuideButton } from "@/components/guides/PageGuideDialog";
import { useStaff } from "@/hooks/use-staff";
import { useLocations } from "@/hooks/use-locations";
import { useDepartments } from "@/hooks/use-departments";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Settings2, Edit2, Trash2, AlertCircle, Download, Upload, X, CheckCircle, TriangleAlert, Search, Users, UserCheck, UserX, ChevronLeft, ChevronRight, History } from "lucide-react";
import { StaffDialog } from "./StaffDialog";
import { StaffHistoryTab } from "./StaffHistoryTab";
import { Checkbox } from "@/components/ui/checkbox";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface RowWarning {
  row: number;
  messages: string[];
}
interface PreviewRow {
  row: number;
  fullName: string;
  code: string;
  username: string;
  valid: boolean;
}

const STICKY_BG_HEADER = "bg-white dark:bg-slate-900";
const STICKY_BG_CELL   = "bg-white dark:bg-slate-950";
const SHADOW_RIGHT     = "shadow-[4px_0_6px_-2px_rgba(0,0,0,0.10)]";
const SHADOW_LEFT      = "shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.10)]";

const stickyHeaderBase   = cn("z-20 border-b", STICKY_BG_HEADER);
const stickyHeaderRight  = cn("z-20 border-b", STICKY_BG_HEADER, SHADOW_LEFT);
const stickyHeaderFullName = cn("z-20 border-b", STICKY_BG_HEADER, SHADOW_RIGHT);
const stickyCellBase     = cn("z-10", STICKY_BG_CELL);
const stickyCellFullName = cn("z-10", STICKY_BG_CELL, SHADOW_RIGHT);
const stickyCellRight    = cn("z-10", STICKY_BG_CELL, SHADOW_LEFT);

const AVATAR_COLORS = [
  "from-violet-500 to-purple-600",
  "from-blue-500 to-cyan-600",
  "from-emerald-500 to-teal-600",
  "from-orange-500 to-amber-600",
  "from-rose-500 to-pink-600",
  "from-indigo-500 to-blue-600",
  "from-fuchsia-500 to-violet-600",
  "from-sky-500 to-indigo-600",
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const ROLE_COLORS: Record<string, string> = {};
const ROLE_COLOR_PALETTE = [
  "bg-violet-100 text-violet-700 border-violet-200",
  "bg-blue-100 text-blue-700 border-blue-200",
  "bg-emerald-100 text-emerald-700 border-emerald-200",
  "bg-amber-100 text-amber-700 border-amber-200",
  "bg-rose-100 text-rose-700 border-rose-200",
  "bg-cyan-100 text-cyan-700 border-cyan-200",
  "bg-indigo-100 text-indigo-700 border-indigo-200",
  "bg-pink-100 text-pink-700 border-pink-200",
];
let _roleColorIdx = 0;
function getRoleBadgeColor(role: string) {
  if (!ROLE_COLORS[role]) {
    ROLE_COLORS[role] = ROLE_COLOR_PALETTE[_roleColorIdx % ROLE_COLOR_PALETTE.length];
    _roleColorIdx++;
  }
  return ROLE_COLORS[role];
}

async function exportStaffExcel(staff: any[]) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Nhân sự");

  ws.columns = [
    { header: "Mã", key: "code", width: 15 },
    { header: "Họ và tên", key: "fullName", width: 25 },
    { header: "Cơ sở", key: "location", width: 20 },
    { header: "Phòng ban", key: "department", width: 20 },
    { header: "Vai trò", key: "role", width: 20 },
    { header: "Số điện thoại", key: "phone", width: 15 },
    { header: "Ngày sinh", key: "dob", width: 15 },
    { header: "Email", key: "email", width: 25 },
    { header: "Tài khoản", key: "username", width: 15 },
    { header: "Địa chỉ", key: "address", width: 30 },
    { header: "Trạng thái", key: "status", width: 12 },
  ];

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 20;

  staff.forEach((s: any) => {
    ws.addRow({
      code: s.code || "",
      fullName: s.fullName || "",
      location: s.assignments?.map((a: any) => a.location?.name).filter(Boolean).join(", ") || "",
      department: s.assignments?.map((a: any) => a.department?.name).filter(Boolean).join(", ") || "",
      role: s.assignments?.map((a: any) => a.role?.name).filter(Boolean).join(", ") || "",
      phone: s.phone || "",
      dob: s.dateOfBirth ? new Date(s.dateOfBirth).toLocaleDateString("vi-VN") : "",
      email: s.email || "",
      username: s.username || "",
      address: s.address || "",
      status: s.status || "",
    });
  });

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.alignment = { vertical: "middle" };
  });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `nhan-su-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export function StaffList() {
  const { data: myPerms } = useMyPermissions();
  const staffPerm = myPerms?.permissions?.["/staff"];
  const isSuperAdmin = myPerms?.isSuperAdmin ?? false;

  const canAdd = isSuperAdmin || !!(staffPerm?.canCreate || staffPerm?.canEdit || staffPerm?.canDelete);
  const canUpload = isSuperAdmin || !!(staffPerm?.canCreate || staffPerm?.canEdit || staffPerm?.canDelete);
  const canDownload = isSuperAdmin || !!(staffPerm?.canEdit || staffPerm?.canDelete);
  const canEditRow = isSuperAdmin || !!(staffPerm?.canEdit || staffPerm?.canDelete);
  const canDeleteRow = isSuperAdmin || !!staffPerm?.canDelete;
  const canDeleteBulk = isSuperAdmin || !!staffPerm?.canDelete;
  const hasAnyRowAction = canEditRow || canDeleteRow;

  const { data: staff, isLoading } = useStaff();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLocationIds, setImportLocationIds] = useState<string[]>([]);
  const [importWarnings, setImportWarnings] = useState<RowWarning[]>([]);
  const [importPreview, setImportPreview] = useState<PreviewRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { data: locations } = useLocations();
  const { data: departments } = useDepartments();

  const [searchKeyword, setSearchKeyword] = useState("");
  const [filterLocationIds, setFilterLocationIds] = useState<string[]>([]);
  const [filterDepartmentIds, setFilterDepartmentIds] = useState<string[]>([]);
  const [filterRoleIds, setFilterRoleIds] = useState<string[]>([]);
  const [filterKey, setFilterKey] = useState(0);
  const [staffPage, setStaffPage] = useState(1);
  const [staffPageSize, setStaffPageSize] = useState(20);
  const [historyOpen, setHistoryOpen] = useState(false);

  const staffDepartments = useMemo(() =>
    (departments ?? []).filter((d: any) => d.name !== "Phòng Khách hàng"),
    [departments]
  );

  const allRoles = useMemo(() =>
    staffDepartments.flatMap((d: any) => (d.roles ?? []).map((r: any) => ({ id: r.id, name: r.name, departmentId: r.departmentId }))),
    [staffDepartments]
  );

  const filteredStaff = useMemo(() => {
    if (!staff) return [];
    return staff.filter((s: any) => {
      const kw = searchKeyword.toLowerCase();
      if (kw) {
        const match = [s.fullName, s.code, s.email, s.phone, s.username]
          .some(v => v?.toLowerCase().includes(kw));
        if (!match) return false;
      }
      if (filterLocationIds.length > 0) {
        const locIds = (s.assignments ?? []).map((a: any) => a.locationId);
        if (!filterLocationIds.some(id => locIds.includes(id))) return false;
      }
      if (filterDepartmentIds.length > 0) {
        const deptIds = (s.assignments ?? []).map((a: any) => a.departmentId);
        if (!filterDepartmentIds.some(id => deptIds.includes(id))) return false;
      }
      if (filterRoleIds.length > 0) {
        const rIds = (s.assignments ?? []).map((a: any) => a.roleId);
        if (!filterRoleIds.some(id => rIds.includes(id))) return false;
      }
      return true;
    });
  }, [staff, searchKeyword, filterLocationIds, filterDepartmentIds, filterRoleIds]);

  const { data: staffLimitData } = useQuery<{ limit: number; activeStaffCount: number }>({
    queryKey: ["/api/system-settings/staff-limit"],
  });

  const isAtLimit = staffLimitData
    ? staffLimitData.activeStaffCount >= staffLimitData.limit
    : false;

  useEffect(() => { setStaffPage(1); }, [searchKeyword, filterLocationIds, filterDepartmentIds, filterRoleIds]);

  const pagedStaff = useMemo(() => {
    const start = (staffPage - 1) * staffPageSize;
    return filteredStaff.slice(start, start + staffPageSize);
  }, [filteredStaff, staffPage, staffPageSize]);

  const handleEdit = (s: any) => {
    setSelectedStaff(s);
    setDialogOpen(true);
  };

  const handleAdd = () => {
    setSelectedStaff(null);
    setDialogOpen(true);
  };

  const handleToggleStatus = async (s: any) => {
    if (!canEditRow) return;
    const newStatus = s.status === "Hoạt động" ? "Không hoạt động" : "Hoạt động";
    try {
      await apiRequest("PUT", `/api/staff/${s.id}`, {
        fullName: s.fullName,
        code: s.code,
        username: s.username,
        phone: s.phone || "",
        email: s.email || "",
        address: s.address || "",
        status: newStatus,
        dateOfBirth: s.dateOfBirth || null,
        locationIds: s.locationIds || [],
        departmentIds: s.departmentIds || [],
        roleIds: s.roleIds || [],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      toast({ title: "Thành công", description: `Đã chuyển sang "${newStatus}"` });
    } catch (error: any) {
      toast({ title: "Lỗi", description: error.message || "Không thể cập nhật trạng thái", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Bạn có chắc chắn muốn xóa nhân sự này?")) return;
    try {
      await apiRequest("DELETE", `/api/staff/${id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      toast({ title: "Thành công", description: "Xóa nhân sự thành công" });
    } catch (error: any) {
      toast({ title: "Lỗi", description: error.message || "Không thể xóa nhân sự", variant: "destructive" });
    }
  };

  const handleExport = async () => {
    if (!staff || staff.length === 0) {
      toast({ title: "Thông báo", description: "Không có dữ liệu để xuất." });
      return;
    }
    try {
      await exportStaffExcel(staff);
      toast({ title: "Thành công", description: "Đã tải xuống danh sách nhân sự." });
    } catch {
      toast({ title: "Lỗi", description: "Không thể xuất file.", variant: "destructive" });
    }
  };

  const getCellText = (val: any): string => {
    if (!val) return "";
    if (val instanceof Date) return val.toISOString().split("T")[0];
    if (typeof val === "object") {
      if (val.text) return val.text.toString().trim();
      if (val.result !== undefined) return val.result.toString().trim();
      return "";
    }
    return val.toString().trim();
  };

  const validateExcelFile = async (file: File) => {
    setImportWarnings([]);
    setImportPreview([]);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.worksheets[0];

      const knownDeptNames = new Set((departments ?? []).map((d: any) => d.name));
      const knownRoleNames = new Set(
        (departments ?? []).flatMap((d: any) => d.roles ?? []).map((r: any) => r.name)
      );
      const validStatuses = new Set(["Hoạt động", "Không hoạt động", ""]);
      const seenUsernames = new Set<string>();
      const seenCodes = new Set<string>();
      const existingCodes = new Set((staff ?? []).map((s: any) => s.code).filter(Boolean));
      const existingUsernames = new Set((staff ?? []).map((s: any) => s.username).filter(Boolean));

      const warnings: RowWarning[] = [];
      const preview: PreviewRow[] = [];

      ws.eachRow((row, idx) => {
        if (idx === 1) return;
        const vals = row.values as any[];
        const rawCode = getCellText(vals[1]);
        const fullName = getCellText(vals[2]);
        const deptName = getCellText(vals[3]);
        const roleName = getCellText(vals[4]);
        const status = getCellText(vals[7]);
        const username = getCellText(vals[10]);
        const password = getCellText(vals[11]);

        if (!fullName && !username && !password) return;

        const effectiveUsername = username || rawCode;
        const msgs: string[] = [];
        if (!fullName) msgs.push("Thiếu Họ và tên (*)");
        if (!effectiveUsername) msgs.push("Thiếu Tài khoản hoặc Mã để tạo tài khoản mặc định");
        if (deptName && !knownDeptNames.has(deptName)) msgs.push(`Phòng ban "${deptName}" không tồn tại`);
        if (roleName && !knownRoleNames.has(roleName)) msgs.push(`Vai trò "${roleName}" không tồn tại`);
        if (status && !validStatuses.has(status)) msgs.push(`Trạng thái "${status}" không hợp lệ`);
        if (effectiveUsername && seenUsernames.has(effectiveUsername)) msgs.push(`Tài khoản "${effectiveUsername}" bị trùng trong file`);
        if (effectiveUsername && existingUsernames.has(effectiveUsername)) msgs.push(`Tài khoản "${effectiveUsername}" đã tồn tại trong hệ thống`);
        if (effectiveUsername) seenUsernames.add(effectiveUsername);
        if (rawCode && seenCodes.has(rawCode)) msgs.push(`Mã "${rawCode}" bị trùng trong file`);
        if (rawCode && existingCodes.has(rawCode)) msgs.push(`Mã "${rawCode}" đã tồn tại trong hệ thống`);
        if (rawCode) seenCodes.add(rawCode);

        if (msgs.length > 0) warnings.push({ row: idx, messages: msgs });
        preview.push({ row: idx, fullName, code: rawCode, username, valid: msgs.length === 0 });
      });

      setImportWarnings(warnings);
      setImportPreview(preview);
    } catch {
      toast({ title: "Lỗi", description: "Không thể đọc file Excel.", variant: "destructive" });
    }
  };

  const handleDownloadTemplate = async () => {
    const ExcelJS = (await import("exceljs")).default;

    const depts: any[] = await fetch("/api/departments", { credentials: "include" })
      .then(r => r.ok ? r.json() : []).catch(() => []);
    const deptNames: string[] = depts.map((d: any) => d.name).filter(Boolean);
    const roleNames: string[] = depts.flatMap((d: any) => d.roles ?? []).map((r: any) => r.name).filter(Boolean);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Mẫu nhập nhân sự");

    const listWs = wb.addWorksheet("__lists__");
    listWs.state = "veryHidden";
    deptNames.forEach((n, i) => { listWs.getCell(`A${i + 1}`).value = n; });
    roleNames.forEach((n, i) => { listWs.getCell(`B${i + 1}`).value = n; });

    ws.columns = [
      { header: "Mã (tự động nếu bỏ trống)", key: "code", width: 26 },
      { header: "Họ và tên (*)", key: "fullName", width: 25 },
      { header: "Phòng ban", key: "department", width: 22 },
      { header: "Vai trò", key: "role", width: 22 },
      { header: "Số điện thoại", key: "phone", width: 15 },
      { header: "Ngày sinh (DD/MM/YYYY)", key: "dob", width: 22 },
      { header: "Trạng thái", key: "status", width: 20 },
      { header: "Email", key: "email", width: 25 },
      { header: "Địa chỉ", key: "address", width: 30 },
      { header: "Tài khoản (*)", key: "username", width: 15 },
      { header: "Mật khẩu (*)", key: "password", width: 15 },
    ];

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    headerRow.height = 30;
    headerRow.alignment = { vertical: "middle", horizontal: "left", wrapText: false };
    ws.columns.forEach((col: any) => { if (col) col.alignment = { wrapText: false }; });

    const dataRows = 200;
    for (let r = 2; r <= dataRows + 1; r++) {
      if (deptNames.length > 0) {
        ws.getCell(`C${r}`).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`__lists__!$A$1:$A$${deptNames.length}`],
          showErrorMessage: true,
          errorTitle: "Giá trị không hợp lệ",
          error: "Vui lòng chọn phòng ban từ danh sách.",
        };
      }
      if (roleNames.length > 0) {
        ws.getCell(`D${r}`).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`__lists__!$B$1:$B$${roleNames.length}`],
          showErrorMessage: true,
          errorTitle: "Giá trị không hợp lệ",
          error: "Vui lòng chọn vai trò từ danh sách.",
        };
      }
      ws.getCell(`G${r}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: ['"Hoạt động,Không hoạt động"'],
        showErrorMessage: true,
        errorTitle: "Giá trị không hợp lệ",
        error: "Vui lòng chọn Hoạt động hoặc Không hoạt động.",
      };
    }

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mau-nhan-su.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const buf = await importFile.arrayBuffer();
      await wb.xlsx.load(buf);
      const ws = wb.worksheets[0];
      const rows: any[] = [];
      const usedCodes = new Set((staff || []).map((s: any) => s.code).filter(Boolean));

      const autoGenerateCode = (roleName: string): string => {
        const prefix = roleName
          .split(" ")
          .map((w: string) => w[0]?.toUpperCase() || "")
          .join("") + "-";
        const nums = [...usedCodes]
          .filter(c => c && c.startsWith(prefix))
          .map(c => parseInt(c.substring(prefix.length), 10))
          .filter(n => !isNaN(n));
        const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
        const generated = `${prefix}${String(next).padStart(2, "0")}`;
        usedCodes.add(generated);
        return generated;
      };

      ws.eachRow((row, idx) => {
        if (idx === 1) return;
        const vals = row.values as any[];
        const fullName = getCellText(vals[2]);
        if (!fullName) return;
        const deptName = getCellText(vals[3]);
        const roleName = getCellText(vals[4]);

        const rawCode = getCellText(vals[1]);
        const code = rawCode || (roleName ? autoGenerateCode(roleName) : `NS-${Date.now()}`);

        const username = getCellText(vals[10]) || code;
        const password = getCellText(vals[11]) || "123456";

        const dept = (departments ?? []).find((d: any) => d.name === deptName);
        const role = dept?.roles?.find((r: any) => r.name === roleName)
          ?? (departments ?? []).flatMap((d: any) => d.roles ?? []).find((r: any) => r.name === roleName);

        const dobRaw = vals[6];
        const dateOfBirth = dobRaw instanceof Date
          ? dobRaw.toISOString().split("T")[0]
          : (getCellText(dobRaw) || null);

        rows.push({
          code,
          fullName,
          phone: getCellText(vals[5]) || "",
          dateOfBirth,
          status: getCellText(vals[7]) || "Hoạt động",
          email: getCellText(vals[8]) || "",
          address: getCellText(vals[9]) || "",
          username,
          password,
          locationIds: importLocationIds,
          departmentIds: dept ? [dept.id] : [],
          roleIds: role ? [role.id] : [],
        });
      });
      if (rows.length === 0) {
        toast({ title: "Lỗi", description: "File không có dữ liệu hợp lệ.", variant: "destructive" });
        setImporting(false);
        return;
      }
      let success = 0;
      const failedRows: string[] = [];
      for (const row of rows) {
        try {
          await apiRequest("POST", "/api/staff", row);
          success++;
        } catch (err: any) {
          failedRows.push(`${row.fullName}: ${err.message || "Lỗi không xác định"}`);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      if (failedRows.length > 0) {
        toast({
          title: `Nhập xong: ${success} thành công, ${failedRows.length} thất bại`,
          description: failedRows.slice(0, 3).join(" · ") + (failedRows.length > 3 ? ` và ${failedRows.length - 3} khác...` : ""),
          variant: "destructive",
        });
      } else {
        toast({ title: "Hoàn tất", description: `Nhập thành công ${success} nhân sự.` });
      }
      setImportOpen(false);
      setImportFile(null);
      setImportLocationIds([]);
      setImportWarnings([]);
      setImportPreview([]);
    } catch {
      toast({ title: "Lỗi", description: "Không thể đọc file Excel.", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredStaff?.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredStaff?.map((s: any) => s.id) || []);
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  };

  const uniqueNames = (assignments: any[], key: string) => {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const a of (assignments ?? [])) {
      const v = a[key]?.name;
      if (v && !seen.has(v)) { seen.add(v); names.push(v); }
    }
    return names.join(", ") || "-";
  };

  const activeCount = useMemo(() => (staff ?? []).filter((s: any) => s.status === "Hoạt động").length, [staff]);
  const inactiveCount = useMemo(() => (staff ?? []).filter((s: any) => s.status !== "Hoạt động").length, [staff]);
  const totalCount = (staff ?? []).length;

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full gap-4">

        {/* ── Header ── */}
        <div className="flex justify-between items-start flex-shrink-0 gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-200">
                <Users className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">Nhân sự</h1>
            </div>
            <p className="text-sm text-muted-foreground pl-12">Danh sách nhân sự và giáo viên hệ thống.</p>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            {canDeleteBulk && selectedIds.length > 0 && (
              <Button variant="outline" className="text-destructive border-destructive hover:bg-destructive/10 rounded-xl h-9 text-xs">
                <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Xóa {selectedIds.length} đã chọn
              </Button>
            )}
            {canUpload && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setImportOpen(true)}
                className="h-9 px-3 rounded-xl flex items-center gap-1.5 bg-white border-border shadow-sm text-xs hover:bg-slate-50"
                data-testid="button-import-staff"
              >
                <Upload className="w-3.5 h-3.5 text-slate-500" /><span>Tải lên</span>
              </Button>
            )}
            {canDownload && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                className="h-9 px-3 rounded-xl flex items-center gap-1.5 bg-white border-border shadow-sm text-xs hover:bg-slate-50"
                data-testid="button-export-staff"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" /><span>Tải xuống</span>
              </Button>
            )}
            {canAdd && (
              <div className="relative inline-flex">
                <Button
                  onClick={handleAdd}
                  className="gap-1.5 h-9 px-4 rounded-xl text-xs bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 shadow-lg shadow-violet-200 border-0"
                  disabled={isAtLimit}
                  data-testid="button-add-staff"
                >
                  <Plus className="w-4 h-4" />
                  Thêm mới
                </Button>
                {isAtLimit && staffLimitData && (
                  <TooltipProvider delayDuration={100}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-4 h-4 rounded-full bg-yellow-100 border border-yellow-300 cursor-help z-10">
                          <AlertCircle className="w-2.5 h-2.5 text-yellow-600" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[280px] text-xs">
                        Hệ thống đã đạt giới hạn <strong>{staffLimitData.limit} nhân sự</strong>. Vui lòng nâng cấp gói dịch vụ để thêm mới nhân viên.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setHistoryOpen(true)}
              className={`h-9 px-3 rounded-xl flex items-center gap-1.5 shadow-sm text-xs ${
                "bg-white border-border text-violet-600 hover:bg-violet-50"
              }`}
              data-testid="button-staff-history"
            >
              <History className="w-3.5 h-3.5" />
              Lịch sử
            </Button>
            <PageGuideButton pageTitle="Nhân sự" />
          </div>
        </div>

        <div className="flex flex-col flex-1 min-h-0 gap-4">
        {/* ── Stats ── */}
        <div className="grid grid-cols-3 gap-3 flex-shrink-0">
          <div className="bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-100 rounded-2xl px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-md shadow-violet-200 flex-shrink-0">
              <Users className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-xs text-violet-600 font-medium">Tổng nhân sự</p>
              <p className="text-xl font-bold text-violet-900">{totalCount}</p>
            </div>
          </div>
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 rounded-2xl px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shadow-emerald-200 flex-shrink-0">
              <UserCheck className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-xs text-emerald-600 font-medium">Đang hoạt động</p>
              <p className="text-xl font-bold text-emerald-900">{activeCount}</p>
            </div>
          </div>
          <div className="bg-gradient-to-br from-rose-50 to-pink-50 border border-rose-100 rounded-2xl px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-md shadow-rose-200 flex-shrink-0">
              <UserX className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-xs text-rose-600 font-medium">Ngừng hoạt động</p>
              <p className="text-xl font-bold text-rose-900">{inactiveCount}</p>
            </div>
          </div>
        </div>

        {/* ── Main card ── */}
        <div className="bg-card border border-border shadow-sm rounded-2xl flex flex-col flex-1 overflow-hidden min-h-0">

          {/* Filter bar */}
          <div className="px-4 py-3 border-b border-border/50 flex flex-wrap gap-2 items-center flex-shrink-0 bg-slate-50/50">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Tìm kiếm tên, mã, email, SĐT..."
                value={searchKeyword}
                onChange={e => setSearchKeyword(e.target.value)}
                className="pl-9 h-9 text-xs rounded-xl bg-white"
                data-testid="input-search-staff"
              />
            </div>
            <div className="min-w-[160px]">
              <MultiSelect
                key={`loc-${filterKey}`}
                options={(locations ?? []).map((l: any) => ({ label: l.name, value: l.id }))}
                onValueChange={setFilterLocationIds}
                placeholder="Cơ sở..."
                maxCount={2}
              />
            </div>
            <div className="min-w-[160px]">
              <MultiSelect
                key={`dept-${filterKey}`}
                options={staffDepartments.map((d: any) => ({ label: d.name, value: d.id }))}
                onValueChange={setFilterDepartmentIds}
                placeholder="Phòng ban..."
                maxCount={2}
              />
            </div>
            <div className="min-w-[160px]">
              <MultiSelect
                key={`role-${filterKey}`}
                options={allRoles.map((r: any) => ({ label: r.name, value: r.id }))}
                onValueChange={setFilterRoleIds}
                placeholder="Vai trò..."
                maxCount={2}
              />
            </div>
            {(searchKeyword || filterLocationIds.length > 0 || filterDepartmentIds.length > 0 || filterRoleIds.length > 0) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => { setSearchKeyword(""); setFilterLocationIds([]); setFilterDepartmentIds([]); setFilterRoleIds([]); setFilterKey(k => k + 1); }}
              >
                <X className="w-3.5 h-3.5 mr-1" /> Xóa bộ lọc
              </Button>
            )}
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            <table className="w-full caption-bottom text-sm border-collapse">
              <thead className="sticky top-0 z-20">
                <tr className="border-b bg-slate-50 dark:bg-slate-900">
                  <th className={cn("h-10 px-3 text-left align-middle font-semibold text-xs text-slate-500 uppercase tracking-wide w-10 sticky left-0", stickyHeaderBase, "bg-slate-50 dark:bg-slate-900")}>
                    <Checkbox
                      checked={!!filteredStaff?.length && selectedIds.length === filteredStaff?.length}
                      onCheckedChange={toggleSelectAll}
                    />
                  </th>
                  <th className={cn("h-10 px-3 text-left align-middle font-semibold text-xs text-slate-500 uppercase tracking-wide whitespace-nowrap min-w-[100px] sticky left-10", stickyHeaderBase, "bg-slate-50 dark:bg-slate-900")}>
                    Mã
                  </th>
                  <th className={cn("h-10 px-3 text-left align-middle font-semibold text-xs text-slate-500 uppercase tracking-wide whitespace-nowrap min-w-[200px] sticky left-[140px]", stickyHeaderFullName, "bg-slate-50 dark:bg-slate-900")}>
                    Họ và tên
                  </th>
                  <th className="h-10 px-3 text-left align-middle font-semibold text-xs text-slate-500 uppercase tracking-wide whitespace-nowrap min-w-[150px]">Cơ sở</th>
                  <th className="h-10 px-3 text-left align-middle font-semibold text-xs text-slate-500 uppercase tracking-wide whitespace-nowrap min-w-[150px]">Phòng ban</th>
                  <th className="h-10 px-3 text-left align-middle font-semibold text-xs text-slate-500 uppercase tracking-wide whitespace-nowrap min-w-[150px]">Vai trò</th>
                  <th className="h-10 px-3 text-left align-middle font-semibold text-xs text-slate-500 uppercase tracking-wide whitespace-nowrap min-w-[130px]">Số điện thoại</th>
                  <th className="h-10 px-3 text-left align-middle font-semibold text-xs text-slate-500 uppercase tracking-wide whitespace-nowrap min-w-[120px]">Ngày sinh</th>
                  <th className="h-10 px-3 text-left align-middle font-semibold text-xs text-slate-500 uppercase tracking-wide whitespace-nowrap min-w-[180px]">Email</th>
                  <th className="h-10 px-3 text-left align-middle font-semibold text-xs text-slate-500 uppercase tracking-wide whitespace-nowrap min-w-[120px]">Tài khoản</th>
                  <th className="h-10 px-3 text-left align-middle font-semibold text-xs text-slate-500 uppercase tracking-wide whitespace-nowrap min-w-[180px]">Địa chỉ</th>
                  <th className="h-10 px-3 text-left align-middle font-semibold text-xs text-slate-500 uppercase tracking-wide whitespace-nowrap min-w-[120px]">Trạng thái</th>
                  {hasAnyRowAction && (
                    <th className={cn("h-10 px-3 text-center align-middle font-semibold text-xs text-slate-500 uppercase tracking-wide w-[70px] sticky right-0", stickyHeaderRight, "bg-slate-50 dark:bg-slate-900")}>
                      Thao tác
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {isLoading ? (
                  <tr>
                    <td colSpan={hasAnyRowAction ? 13 : 12} className="h-40 text-center text-muted-foreground py-10">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm text-slate-400">Đang tải dữ liệu...</span>
                      </div>
                    </td>
                  </tr>
                ) : !filteredStaff?.length ? (
                  <tr>
                    <td colSpan={hasAnyRowAction ? 13 : 12} className="h-40 text-center text-muted-foreground py-10">
                      <div className="flex flex-col items-center gap-2">
                        <Users className="w-10 h-10 text-slate-200" />
                        <span className="text-sm text-slate-400">
                          {staff?.length ? "Không tìm thấy nhân sự phù hợp." : "Chưa có dữ liệu nhân sự."}
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  pagedStaff.map((s: any) => {
                    const roleName = uniqueNames(s.assignments, "role");
                    return (
                      <tr
                        key={s.id}
                        className={cn(
                          "border-b transition-all duration-150 group text-xs",
                          selectedIds.includes(s.id)
                            ? "bg-violet-50/80 dark:bg-violet-950/20 hover:bg-violet-100/80 dark:hover:bg-violet-950/30"
                            : "bg-white dark:bg-slate-950 hover:bg-slate-50/80 dark:hover:bg-slate-900"
                        )}
                      >
                        <td className={cn("p-3 align-middle w-10 sticky left-0", stickyCellBase,
                          selectedIds.includes(s.id) ? "bg-violet-50/80" : "")}
                          onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.includes(s.id)}
                            onCheckedChange={() => toggleSelectOne(s.id)}
                          />
                        </td>
                        <td className={cn("p-3 align-middle sticky left-10", stickyCellBase,
                          selectedIds.includes(s.id) ? "bg-violet-50/80" : "")}>
                          <span className="font-mono text-[11px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-md">{s.code}</span>
                        </td>
                        <td className={cn("p-3 align-middle sticky left-[140px]", stickyCellFullName,
                          selectedIds.includes(s.id) ? "bg-violet-50/80" : "")}>
                          <div className="flex items-center gap-2.5">
                            <div className={cn(
                              "w-8 h-8 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0 shadow-sm",
                              getAvatarColor(s.fullName || "?")
                            )}>
                              {getInitials(s.fullName || "?")}
                            </div>
                            <span className="font-semibold text-slate-700 whitespace-nowrap">{s.fullName}</span>
                          </div>
                        </td>
                        <td className="p-3 align-middle whitespace-nowrap text-slate-600">
                          {uniqueNames(s.assignments, "location")}
                        </td>
                        <td className="p-3 align-middle whitespace-nowrap text-slate-600">
                          {uniqueNames(s.assignments, "department")}
                        </td>
                        <td className="p-3 align-middle whitespace-nowrap">
                          {roleName !== "-" ? (
                            <span className={cn(
                              "px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap",
                              getRoleBadgeColor(roleName)
                            )}>
                              {roleName}
                            </span>
                          ) : <span className="text-slate-400">-</span>}
                        </td>
                        <td className="p-3 align-middle whitespace-nowrap text-slate-600">{s.phone || <span className="text-slate-300">—</span>}</td>
                        <td className="p-3 align-middle whitespace-nowrap text-slate-600">
                          {s.dateOfBirth ? new Date(s.dateOfBirth).toLocaleDateString("vi-VN") : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="p-3 align-middle whitespace-nowrap text-slate-600">{s.email || <span className="text-slate-300">—</span>}</td>
                        <td className="p-3 align-middle whitespace-nowrap text-slate-600">{s.username || <span className="text-slate-300">—</span>}</td>
                        <td className="p-3 align-middle max-w-[200px] truncate text-slate-600">{s.address || <span className="text-slate-300">—</span>}</td>
                        <td className="p-3 align-middle" onClick={(e) => e.stopPropagation()}>
                          {canEditRow ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  className={cn(
                                    "px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-all cursor-pointer flex items-center gap-1 border",
                                    s.status === "Hoạt động"
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                      : "bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100"
                                  )}
                                >
                                  <span className={cn("w-1.5 h-1.5 rounded-full", s.status === "Hoạt động" ? "bg-emerald-500" : "bg-rose-400")} />
                                  {s.status}
                                  <svg className="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start">
                                <DropdownMenuItem
                                  onClick={() => s.status !== "Hoạt động" && handleToggleStatus(s)}
                                  className={cn("gap-2 text-xs", s.status === "Hoạt động" && "font-semibold text-emerald-700")}
                                >
                                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                                  Hoạt động
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => s.status !== "Không hoạt động" && handleToggleStatus(s)}
                                  className={cn("gap-2 text-xs", s.status === "Không hoạt động" && "font-semibold text-rose-600")}
                                >
                                  <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />
                                  Không hoạt động
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <span
                              className={cn(
                                "px-2.5 py-1 rounded-full text-[11px] font-medium border whitespace-nowrap flex items-center gap-1 w-fit",
                                s.status === "Hoạt động"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-rose-50 text-rose-600 border-rose-200"
                              )}
                            >
                              <span className={cn("w-1.5 h-1.5 rounded-full", s.status === "Hoạt động" ? "bg-emerald-500" : "bg-rose-400")} />
                              {s.status}
                            </span>
                          )}
                        </td>
                        {hasAnyRowAction && (
                          <td className={cn("p-3 align-middle text-center sticky right-0", stickyCellRight,
                            selectedIds.includes(s.id) ? "bg-violet-50/80" : "")}
                            onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-100">
                                  <Settings2 className="w-3.5 h-3.5 text-slate-500" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {canEditRow && (
                                  <DropdownMenuItem onClick={() => handleEdit(s)} className="gap-2 text-xs">
                                    <Edit2 className="w-3.5 h-3.5" /> Chỉnh sửa
                                  </DropdownMenuItem>
                                )}
                                {canDeleteRow && (
                                  <DropdownMenuItem onClick={() => handleDelete(s.id)} className="gap-2 text-xs text-destructive focus:text-destructive">
                                    <Trash2 className="w-3.5 h-3.5" /> Xóa
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filteredStaff.length > 0 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t text-sm text-muted-foreground bg-slate-50/50 flex-shrink-0">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Hiển thị</span>
                <select
                  value={staffPageSize}
                  onChange={e => { setStaffPageSize(Number(e.target.value)); setStaffPage(1); }}
                  className="border border-slate-200 rounded-lg px-2 py-1 text-xs text-foreground bg-white focus:outline-none focus:ring-1 focus:ring-violet-400"
                >
                  {[10, 20, 50, 100].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <span>/ {filteredStaff.length} nhân sự</span>
                {staffLimitData && (
                  <span className="ml-2 px-2 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-full text-[11px] font-medium">
                    {staffLimitData.activeStaffCount}/{staffLimitData.limit} hoạt động
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0 rounded-lg border-slate-200"
                  disabled={staffPage <= 1}
                  onClick={() => setStaffPage(p => p - 1)}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <span className="px-3 text-xs font-medium text-slate-600">
                  {staffPage} / {Math.max(1, Math.ceil(filteredStaff.length / staffPageSize))}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0 rounded-lg border-slate-200"
                  disabled={staffPage >= Math.ceil(filteredStaff.length / staffPageSize)}
                  onClick={() => setStaffPage(p => p + 1)}
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
          </div>
      </div>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="w-[90vw] max-w-[90vw] h-[min(88vh,760px)] max-h-[calc(100vh-2rem)] flex flex-col gap-0 p-5 rounded-2xl overflow-hidden border-slate-200 shadow-2xl">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <History className="h-5 w-5 text-violet-600" />
              Lịch sử nhân sự
            </DialogTitle>
            <DialogDescription>
              Nhật ký tạo mới, cập nhật và xoá nhân sự
            </DialogDescription>
          </DialogHeader>
          <StaffHistoryTab
            locationOptions={(locations ?? []).map((location: any) => ({ value: location.id, label: location.name }))}
          />
        </DialogContent>
      </Dialog>

      <StaffDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        staff={selectedStaff}
        allStaff={staff || []}
      />

      <Dialog open={importOpen} onOpenChange={(v) => {
        setImportOpen(v);
        if (!v) {
          setImportFile(null);
          setImportLocationIds([]);
          setImportWarnings([]);
          setImportPreview([]);
        }
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Tải lên danh sách nhân sự</DialogTitle>
            <DialogDescription>Nhập danh sách nhân sự từ file Excel (.xlsx)</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 overflow-y-auto flex-1 pr-1">
            <Button variant="outline" size="sm" className="text-xs gap-2" onClick={handleDownloadTemplate}>
              <Download className="w-3.5 h-3.5" /> Tải mẫu file Excel
            </Button>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Cơ sở áp dụng <span className="text-destructive">*</span>
              </label>
              <MultiSelect
                options={(locations ?? []).map((l: any) => ({ label: l.name, value: l.id }))}
                onValueChange={setImportLocationIds}
                defaultValue={importLocationIds}
                placeholder="Chọn cơ sở..."
                maxCount={3}
              />
              {importLocationIds.length === 0 && (
                <p className="text-xs text-destructive">Vui lòng chọn ít nhất một cơ sở để tiếp tục.</p>
              )}
              {importLocationIds.length > 0 && (
                <p className="text-xs text-muted-foreground">Tất cả nhân sự trong file sẽ được gán vào các cơ sở đã chọn.</p>
              )}
            </div>

            <div
              className="border-2 border-dashed border-border rounded-xl p-5 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              {importFile ? (
                <div className="flex items-center justify-center gap-2">
                  <span className="text-sm font-medium text-foreground">{importFile.name}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setImportFile(null); setImportWarnings([]); setImportPreview([]); }}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="text-muted-foreground text-sm">
                  <Upload className="w-7 h-7 mx-auto mb-2 opacity-50" />
                  <p>Nhấp để chọn file Excel (.xlsx)</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setImportFile(f);
                  if (f) validateExcelFile(f);
                }}
              />
            </div>

            {importPreview.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">
                    Tìm thấy <span className="text-primary">{importPreview.length}</span> dòng dữ liệu
                  </span>
                  {importWarnings.length === 0 ? (
                    <span className="flex items-center gap-1 text-green-600 text-xs font-medium">
                      <CheckCircle className="w-4 h-4" /> Không có lỗi
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-amber-600 text-xs font-medium">
                      <TriangleAlert className="w-4 h-4" /> {importWarnings.length} dòng có cảnh báo
                    </span>
                  )}
                </div>

                {importWarnings.length > 0 && (
                  <div className="border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
                    {importWarnings.map((w) => (
                      <div key={w.row} className="text-xs">
                        <span className="font-semibold text-amber-700 dark:text-amber-400">Dòng {w.row}:</span>{" "}
                        <span className="text-amber-700 dark:text-amber-300">{w.messages.join(" · ")}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="pt-2 border-t">
            <Button variant="outline" onClick={() => {
              setImportOpen(false);
              setImportFile(null);
              setImportLocationIds([]);
              setImportWarnings([]);
              setImportPreview([]);
            }}>Huỷ</Button>
            <Button onClick={handleImport} disabled={!importFile || importing || importLocationIds.length === 0}>
              {importing ? "Đang nhập..." : `Nhập dữ liệu${importPreview.length > 0 ? ` (${importPreview.filter(r => r.valid).length} dòng hợp lệ)` : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
