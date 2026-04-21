import { useState, useRef, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useStaff } from "@/hooks/use-staff";
import { useLocations } from "@/hooks/use-locations";
import { useDepartments } from "@/hooks/use-departments";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Settings2, Edit2, Trash2, AlertCircle, Download, Upload, X, CheckCircle, TriangleAlert, Search } from "lucide-react";
import { StaffDialog } from "./StaffDialog";
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

const stickyHeaderBase =
  "z-20 bg-white dark:bg-slate-900 border-b shadow-[1px_0_0_0_rgba(0,0,0,0.08)]";
const stickyRightHeader =
  "z-20 bg-white dark:bg-slate-900 border-b shadow-[-1px_0_0_0_rgba(0,0,0,0.08)]";
const stickyCellBase =
  "z-10 bg-white dark:bg-slate-950 shadow-[1px_0_0_0_rgba(0,0,0,0.06)]";
const stickyCellRight =
  "z-10 bg-white dark:bg-slate-950 shadow-[-1px_0_0_0_rgba(0,0,0,0.06)]";

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

  const handleEdit = (s: any) => {
    setSelectedStaff(s);
    setDialogOpen(true);
  };

  const handleAdd = () => {
    setSelectedStaff(null);
    setDialogOpen(true);
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
    headerRow.height = 20;

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

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-foreground font-display">Nhân sự</h1>
            <p className="text-muted-foreground mt-1">Danh sách nhân sự và giáo viên hệ thống.</p>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            {canDeleteBulk && selectedIds.length > 0 && (
              <Button variant="outline" className="text-destructive border-destructive hover:bg-destructive/10">
                Xóa {selectedIds.length} đã chọn
              </Button>
            )}
            {canUpload && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setImportOpen(true)}
                className="h-9 px-3 rounded-xl flex items-center gap-2 bg-white border-border shadow-sm text-xs"
                data-testid="button-import-staff"
              >
                <Upload className="w-4 h-4" /><span>Tải lên</span>
              </Button>
            )}
            {canDownload && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                className="h-9 px-3 rounded-xl flex items-center gap-2 bg-white border-border shadow-sm text-xs"
                data-testid="button-export-staff"
              >
                <Download className="w-4 h-4" /><span>Tải xuống</span>
              </Button>
            )}
            {canAdd && (
              <Button
                onClick={handleAdd}
                className="gap-2 h-9 px-4 rounded-xl text-xs shadow-lg shadow-primary/20"
                disabled={isAtLimit}
                data-testid="button-add-staff"
                title={isAtLimit ? `Hệ thống đã đạt giới hạn ${staffLimitData?.limit} nhân sự` : undefined}
              >
                <Plus className="w-4 h-4" />
                Thêm mới
              </Button>
            )}
          </div>
        </div>

        {isAtLimit && staffLimitData && (
          <div className="flex items-start gap-3 p-4 rounded-xl border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-700 text-yellow-800 dark:text-yellow-300" data-testid="alert-staff-limit">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm">
              Hệ thống đã đạt giới hạn <strong>{staffLimitData.limit} nhân sự</strong>. Vui lòng nâng cấp gói dịch vụ để thêm mới nhân viên.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Tìm kiếm tên, mã, email, SĐT..."
              value={searchKeyword}
              onChange={e => setSearchKeyword(e.target.value)}
              className="pl-9 h-9 text-xs rounded-xl"
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
              className="h-9 text-xs text-muted-foreground"
              onClick={() => { setSearchKeyword(""); setFilterLocationIds([]); setFilterDepartmentIds([]); setFilterRoleIds([]); setFilterKey(k => k + 1); }}
            >
              <X className="w-3.5 h-3.5 mr-1" /> Xóa bộ lọc
            </Button>
          )}
        </div>

        <div className="bg-card border border-border shadow-sm rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full caption-bottom text-sm border-collapse">
              <thead className="sticky top-0 z-20">
                <tr className="bg-muted/60 backdrop-blur-sm border-b">
                  <th className={cn("h-10 px-3 text-left align-middle font-semibold text-foreground w-10 sticky left-0", stickyHeaderBase)}>
                    <Checkbox
                      checked={!!filteredStaff?.length && selectedIds.length === filteredStaff?.length}
                      onCheckedChange={toggleSelectAll}
                    />
                  </th>
                  <th className={cn("h-10 px-3 text-left align-middle font-semibold text-foreground whitespace-nowrap min-w-[100px] sticky left-10", stickyHeaderBase)}>
                    Mã
                  </th>
                  <th className={cn("h-10 px-3 text-left align-middle font-semibold text-foreground whitespace-nowrap min-w-[180px] sticky left-[140px]", stickyHeaderBase)}>
                    Họ và tên
                  </th>
                  <th className="h-10 px-3 text-left align-middle font-semibold text-foreground whitespace-nowrap min-w-[150px]">Cơ sở</th>
                  <th className="h-10 px-3 text-left align-middle font-semibold text-foreground whitespace-nowrap min-w-[150px]">Phòng ban</th>
                  <th className="h-10 px-3 text-left align-middle font-semibold text-foreground whitespace-nowrap min-w-[150px]">Vai trò</th>
                  <th className="h-10 px-3 text-left align-middle font-semibold text-foreground whitespace-nowrap min-w-[130px]">Số điện thoại</th>
                  <th className="h-10 px-3 text-left align-middle font-semibold text-foreground whitespace-nowrap min-w-[120px]">Ngày sinh</th>
                  <th className="h-10 px-3 text-left align-middle font-semibold text-foreground whitespace-nowrap min-w-[180px]">Email</th>
                  <th className="h-10 px-3 text-left align-middle font-semibold text-foreground whitespace-nowrap min-w-[120px]">Tài khoản</th>
                  <th className="h-10 px-3 text-left align-middle font-semibold text-foreground whitespace-nowrap min-w-[180px]">Địa chỉ</th>
                  <th className="h-10 px-3 text-left align-middle font-semibold text-foreground whitespace-nowrap min-w-[110px]">Trạng thái</th>
                  {hasAnyRowAction && (
                    <th className={cn("h-10 px-3 text-center align-middle font-semibold text-foreground w-[70px] sticky right-0", stickyRightHeader)}>
                      Thao tác
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {isLoading ? (
                  <tr>
                    <td colSpan={hasAnyRowAction ? 13 : 12} className="h-32 text-center text-muted-foreground py-10">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        Đang tải...
                      </div>
                    </td>
                  </tr>
                ) : !filteredStaff?.length ? (
                  <tr>
                    <td colSpan={hasAnyRowAction ? 13 : 12} className="h-32 text-center text-muted-foreground py-10">
                      {staff?.length ? "Không tìm thấy nhân sự phù hợp." : "Chưa có dữ liệu nhân sự."}
                    </td>
                  </tr>
                ) : (
                  filteredStaff.map((s: any) => (
                    <tr
                      key={s.id}
                      className={cn(
                        "border-b transition-colors text-xs",
                        selectedIds.includes(s.id)
                          ? "bg-blue-50 dark:bg-blue-950/20 hover:bg-blue-100 dark:hover:bg-blue-950/30"
                          : "bg-white dark:bg-slate-950 hover:bg-gray-50 dark:hover:bg-slate-900"
                      )}
                    >
                      <td className={cn("p-3 align-middle w-10 sticky left-0", stickyCellBase)}
                        onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.includes(s.id)}
                          onCheckedChange={() => toggleSelectOne(s.id)}
                        />
                      </td>
                      <td className={cn("p-3 align-middle font-mono whitespace-nowrap sticky left-10", stickyCellBase)}>
                        {s.code}
                      </td>
                      <td className={cn("p-3 align-middle font-semibold whitespace-nowrap sticky left-[140px]", stickyCellBase)}>
                        {s.fullName}
                      </td>
                      <td className="p-3 align-middle whitespace-nowrap">
                        {uniqueNames(s.assignments, "location")}
                      </td>
                      <td className="p-3 align-middle whitespace-nowrap">
                        {uniqueNames(s.assignments, "department")}
                      </td>
                      <td className="p-3 align-middle whitespace-nowrap">
                        {uniqueNames(s.assignments, "role")}
                      </td>
                      <td className="p-3 align-middle whitespace-nowrap">{s.phone || "-"}</td>
                      <td className="p-3 align-middle whitespace-nowrap">
                        {s.dateOfBirth ? new Date(s.dateOfBirth).toLocaleDateString("vi-VN") : "-"}
                      </td>
                      <td className="p-3 align-middle whitespace-nowrap">{s.email || "-"}</td>
                      <td className="p-3 align-middle whitespace-nowrap">{s.username || "-"}</td>
                      <td className="p-3 align-middle max-w-[200px] truncate">{s.address || "-"}</td>
                      <td className="p-3 align-middle">
                        <span className={`px-2 py-1 rounded-full text-xs whitespace-nowrap ${s.status === "Hoạt động" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                          {s.status}
                        </span>
                      </td>
                      {hasAnyRowAction && (
                        <td className={cn("p-3 align-middle text-center sticky right-0", stickyCellRight)}
                          onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Settings2 className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {canEditRow && (
                                <DropdownMenuItem onClick={() => handleEdit(s)} className="gap-2">
                                  <Edit2 className="w-4 h-4" /> Sửa
                                </DropdownMenuItem>
                              )}
                              {canDeleteRow && (
                                <DropdownMenuItem onClick={() => handleDelete(s.id)} className="gap-2 text-destructive focus:text-destructive">
                                  <Trash2 className="w-4 h-4" /> Xóa
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

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
