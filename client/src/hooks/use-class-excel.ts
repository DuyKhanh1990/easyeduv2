import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ExcelJS from "exceljs";
import { useToast } from "@/hooks/use-toast";
import { getStaffRoleOptions, isDefaultTrainingDepartmentStaff, resolveTeacherRoleId } from "@/lib/staff-role-options";
import { groupRowsByClassCode, submitClassGroups, type ParsedClassRow } from "@/hooks/use-class-bulk-submit";

interface UseClassExcelOptions {
  locations?: any[];
}

const WEEKDAY_MAP: Record<number, string> = { 1: "T2", 2: "T3", 3: "T4", 4: "T5", 5: "T6", 6: "T7", 0: "CN" };
const TYPE_LABEL: Record<string, string> = { group: "Nhóm", tutor: "Cá nhân 1-1" };

function feePackageOptionLabel(pkg: any): string {
  const courseName = String(pkg.courseName || "Chưa gắn khóa học").trim();
  const packageName = String(pkg.name || "").trim();
  const sessions = Number(pkg.sessions);
  const sessionLabel = Number.isFinite(sessions) && sessions > 0 ? ` — ${sessions} buổi` : "";
  return `${courseName} — ${packageName}${sessionLabel}`;
}

function buildTeacherRoleOptions(staff: any[] = [], locations: any[] = []) {
  const locationNames = new Map(locations.map((location) => [String(location.id), String(location.name || "")]));
  const options: { id: string; roleId: string; locationId?: string; label: string; fullName: string }[] = [];
  for (const member of staff) {
    if (member.status === "Không hoạt động" || !isDefaultTrainingDepartmentStaff(member)) continue;
    for (const assignment of member.assignments || []) {
      const roleId = String(assignment?.roleId ?? assignment?.role?.id ?? "");
      const roleName = String(assignment?.role?.name ?? assignment?.roleName ?? "").trim();
      const locationId = String(assignment?.locationId ?? "");
      if (
        assignment?.department?.isSystem !== true ||
        assignment?.department?.name !== "Phòng Đào tạo" ||
        !roleId ||
        !/giáo viên|trợ giảng/i.test(roleName)
      ) continue;
      const locationLabel = locationNames.get(locationId);
      options.push({
        id: String(member.id),
        roleId,
        locationId: locationId || undefined,
        fullName: String(member.fullName || "").trim(),
        label: `${String(member.fullName || "").trim()} — ${roleName}${locationLabel ? ` (${locationLabel})` : ""}`,
      });
    }
  }
  return [...new Map(options.map((option) => [option.label.toLowerCase(), option])).values()];
}

// Same logic as getComputedStatus in use-class-list.ts:
// "closed" (admin-forced) → "Đã đóng"; else compare today vs startDate/endDate
function computeExportStatus(cls: any): string {
  if (cls.status === "closed") return "Đã đóng";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = cls.startDate ? new Date(cls.startDate) : null;
  const end = cls.endDate ? new Date(cls.endDate) : null;
  if (!start || !end) return cls.status || "";
  if (today < start) return "Tuyển sinh";
  if (today > end) return "Kết thúc";
  return "Đang học";
}

export async function exportClassesToExcel(options: {
  locationId?: string;
  search?: string;
  status?: string;
  toast: (opts: any) => void;
}) {
  const { locationId, search, status, toast } = options;
  try {
    // Use the non-paginated endpoint (no view=list) to get ALL classes at once.
    // getClasses() on the server has no ALLOWED_SIZES cap and returns full data.
    const params = new URLSearchParams();
    if (locationId && locationId !== "all") params.set("locationId", locationId);

    const res = await fetch(`/api/classes?${params}`, { credentials: "include" });
    if (!res.ok) throw new Error("Lỗi khi tải dữ liệu");
    const json = await res.json();
    // Non-paginated endpoint returns a plain array
    let data: any[] = Array.isArray(json) ? json : (json.data ?? []);

    // Apply search & status filters client-side (server already filters by location)
    if (search) {
      const q = search.toLowerCase();
      data = data.filter((cls: any) =>
        (cls.classCode || "").toLowerCase().includes(q) ||
        (cls.name || "").toLowerCase().includes(q)
      );
    }
    if (status && status !== "all") {
      data = data.filter((cls: any) => {
        const computed = computeExportStatus(cls);
        const statusMap: Record<string, string> = {
          planning: "Tuyển sinh", active: "Đang học", closed: "Kết thúc",
        };
        return (statusMap[status] || status) === computed;
      });
    }

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Danh sách lớp học");

    const headers = [
      "Mã lớp", "Loại", "Tên lớp", "Trạng thái", "Cơ sở",
      "Ngày bắt đầu", "Ngày kết thúc", "Thứ học", "Ca học",
      "Giáo viên", "Phụ trách", "HV chờ", "HV chính thức",
      "Tổng buổi", "Đã tạo lịch",
    ];

    ws.columns = [
      { width: 16 }, { width: 14 }, { width: 26 }, { width: 14 }, { width: 20 },
      { width: 14 }, { width: 14 }, { width: 16 }, { width: 22 },
      { width: 30 }, { width: 22 }, { width: 10 }, { width: 14 },
      { width: 12 }, { width: 14 },
    ];

    const headerRow = ws.addRow(headers);
    headerRow.height = 30;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2E5FA3" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = {
        top: { style: "thin" }, left: { style: "thin" },
        bottom: { style: "thin" }, right: { style: "thin" },
      };
    });

    data.forEach((cls: any, idx: number) => {
      const weekdayStr = (cls.weekdays || [])
        .slice().sort((a: number, b: number) => {
          // Sort: T2..T7 before CN (0 = CN goes last)
          const order = (n: number) => n === 0 ? 7 : n;
          return order(a) - order(b);
        })
        .map((d: number) => WEEKDAY_MAP[d] ?? String(d))
        .join(", ");

      const shiftStr = (cls.shiftTemplates || [])
        .map((s: any) => s?.name || "").filter(Boolean).join(", ");

      const teacherStr = (cls.teachers || [])
        .map((t: any) => typeof t === "string" ? t : t?.fullName || "").filter(Boolean).join(", ");

      const managerStr = (cls.managers || [])
        .map((m: any) => typeof m === "string" ? m : m?.fullName || "").filter(Boolean).join(", ");

      const row = ws.addRow([
        cls.classCode || "",
        TYPE_LABEL[cls.classType] || "Nhóm",
        cls.name || "",
        computeExportStatus(cls),
        cls.location?.name || "",
        cls.startDate ? new Date(cls.startDate) : "",
        cls.endDate ? new Date(cls.endDate) : "",
        weekdayStr,
        shiftStr,
        teacherStr,
        managerStr,
        cls.waitingStudentsCount ?? 0,
        cls.activeStudentsCount ?? 0,
        cls.totalSessions ?? 0,
        cls.scheduleGenerated ? "Có" : "Chưa",
      ]);

      const bg = idx % 2 === 0 ? "FFFFFFFF" : "FFF5F7FA";
      row.eachCell((cell, colIdx) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
        cell.border = {
          top: { style: "thin" }, left: { style: "thin" },
          bottom: { style: "thin" }, right: { style: "thin" },
        };
        cell.alignment = { vertical: "middle" };
        // Date columns
        if ((colIdx === 6 || colIdx === 7) && cell.value instanceof Date) {
          cell.numFmt = "dd/mm/yyyy";
        }
        // Number columns — center align
        if (colIdx >= 12 && colIdx <= 15) {
          cell.alignment = { vertical: "middle", horizontal: "center" };
        }
      });
    });

    // Freeze header row
    ws.views = [{ state: "frozen", ySplit: 1 }];

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `danh_sach_lop_hoc_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({ title: "Thành công", description: `Đã xuất ${data.length} lớp học ra file Excel.` });
  } catch {
    toast({ title: "Lỗi", description: "Không thể xuất file Excel.", variant: "destructive" });
  }
}

// ─── Per-class student export ─────────────────────────────────────────────

function fmtDate(val: string | null | undefined): string {
  if (!val) return "";
  const d = new Date(val);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("vi-VN");
}

function fmtCurrency(n: number): string {
  return n.toLocaleString("vi-VN");
}

function invoiceLabel(inv: { grandTotal: number; paidAmount: number; status: string } | null): string {
  if (!inv || inv.grandTotal === 0) return "Chưa có";
  const pct = inv.grandTotal > 0 ? Math.round((inv.paidAmount / inv.grandTotal) * 100) : 0;
  return `${fmtCurrency(inv.paidAmount)} / ${fmtCurrency(inv.grandTotal)}\n${pct}% đã thanh toán`;
}

function paymentStatusLabel(status: string | undefined): string {
  switch (status) {
    case "paid":    return "Đã thanh toán";
    case "partial": return "Thanh toán 1 phần";
    case "unpaid":  return "Chưa thanh toán";
    case "debt":    return "Có nợ";
    default:        return "Chưa có";
  }
}

function enrollmentStatusLabel(startDate: string | null | undefined, endDate: string | null | undefined): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  if (!start || !end) return "Không xác định";
  if (today < start) return "Chưa bắt đầu";
  if (today > end) return "Đã kết thúc";
  return "Đang học";
}

export async function exportClassStudentsToExcel(options: {
  classId: string;
  className: string;
  classCode: string;
  toast: (opts: any) => void;
}) {
  const { classId, className, classCode, toast } = options;
  try {
    const res = await fetch(`/api/classes/${classId}/enrolled-students`, { credentials: "include" });
    if (!res.ok) throw new Error("Lỗi khi tải danh sách học viên");
    const data: any[] = await res.json();

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Danh sách học viên");

    const headers = [
      "Tên học viên", "Mã HV", "Loại", "Bắt đầu", "Kết thúc",
      "Số buổi", "Đã học", "Còn lại", "Hóa đơn", "Trạng thái",
    ];

    ws.columns = [
      { width: 28 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 14 },
      { width: 10 }, { width: 10 }, { width: 10 }, { width: 36 }, { width: 20 },
    ];

    // Title row
    ws.mergeCells("A1:J1");
    const titleCell = ws.getCell("A1");
    titleCell.value = `Danh sách học viên — ${classCode}: ${className}`;
    titleCell.font = { bold: true, size: 13, color: { argb: "FF2E5FA3" } };
    titleCell.alignment = { vertical: "middle", horizontal: "left" };
    ws.getRow(1).height = 24;

    const headerRow = ws.addRow(headers);
    headerRow.height = 28;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2E5FA3" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = {
        top: { style: "thin" }, left: { style: "thin" },
        bottom: { style: "thin" }, right: { style: "thin" },
      };
    });

    data.forEach((enr: any, idx: number) => {
      const inv = enr.invoice;
      const row = ws.addRow([
        enr.fullName || "",
        enr.code || "",
        enr.enrollmentStatus === "waiting" ? "Chờ" : "Chính thức",
        fmtDate(enr.startDate),
        fmtDate(enr.endDate),
        enr.totalSessions ?? 0,
        enr.attendedSessions ?? 0,
        enr.remainingSessions ?? 0,
        invoiceLabel(inv),
        enrollmentStatusLabel(enr.startDate, enr.endDate),
      ]);

      const bg = idx % 2 === 0 ? "FFFFFFFF" : "FFF5F7FA";
      row.eachCell((cell, colIdx) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
        cell.border = {
          top: { style: "thin" }, left: { style: "thin" },
          bottom: { style: "thin" }, right: { style: "thin" },
        };
        cell.alignment = { vertical: "middle" };
        if (colIdx >= 6 && colIdx <= 8) {
          cell.alignment = { vertical: "middle", horizontal: "center" };
        }
        if (colIdx === 9) {
          cell.alignment = { vertical: "middle", wrapText: true };
          // tint invoice cell by payment status
          const status = inv?.status;
          if (!inv) cell.font = { color: { argb: "FF999999" }, italic: true };
          else if (status === "paid") cell.font = { color: { argb: "FF16A34A" } };
          else if (status === "partial") cell.font = { color: { argb: "FFCA8A04" } };
          else if (status === "debt") cell.font = { color: { argb: "FFDC2626" } };
        }
        if (colIdx === 10) {
          // Trạng thái học: color by date-based status
          const ls = enrollmentStatusLabel(enr.startDate, enr.endDate);
          cell.alignment = { vertical: "middle", horizontal: "center" };
          if (ls === "Đang học") cell.font = { color: { argb: "FF16A34A" }, bold: true };
          else if (ls === "Đã kết thúc") cell.font = { color: { argb: "FFDC2626" }, bold: true };
          else if (ls === "Chưa bắt đầu") cell.font = { color: { argb: "FFCA8A04" }, bold: true };
          else cell.font = { color: { argb: "FF999999" } };
        }
      });
      row.height = 32;
    });

    ws.views = [{ state: "frozen", ySplit: 2 }];

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `hv_${classCode}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({ title: "Thành công", description: `Đã xuất ${data.length} học viên của lớp ${classCode}.` });
  } catch {
    toast({ title: "Lỗi", description: "Không thể xuất danh sách học viên.", variant: "destructive" });
  }
}

// ─── Main hook ─────────────────────────────────────────────────────────────

export function useClassExcel({ locations }: UseClassExcelOptions) {
  const { toast } = useToast();

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatus, setImportStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");

  const { data: shiftTemplates } = useQuery<any[]>({
    queryKey: ["/api/shift-templates?type=class"],
  });

  const { data: staff } = useQuery<any[]>({
    queryKey: ["/api/staff?minimal=true"],
  });

  const { data: feePackages } = useQuery<any[]>({
    queryKey: ["/api/fee-packages"],
  });

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    setImportProgress(0);
    setImportStatus("idle");
  };

  const resetImport = () => {
    setImportFile(null);
    setImportProgress(0);
    setImportStatus("idle");
  };

  const handleImportUpload = async () => {
    if (!importFile) return;
    setImportStatus("uploading");
    setImportProgress(10);

    try {
      const workbook = new ExcelJS.Workbook();
      const buffer = await importFile.arrayBuffer();
      await workbook.xlsx.load(buffer);
      setImportProgress(30);

      const worksheet = workbook.getWorksheet(1);
      const headerText = Array.from({ length: worksheet!.columnCount }, (_, index) =>
        worksheet!.getCell(1, index + 1).text?.toString().trim().toLowerCase() || ""
      );
      const endSessionsColumn = headerText.findIndex((value) => value === "số buổi kết thúc") + 1;
      const feePackageColumn = headerText.findIndex((value) => value === "gói học phí") + 1;
      const skipHolidaysColumn = headerText.findIndex((value) => value === "bỏ qua ngày nghỉ lễ") + 1;
      const teacherColumns = headerText
        .map((value, index) => ({ value, column: index + 1 }))
        .filter(({ value }) => /^giáo viên\s*[1-4]$/.test(value))
        .map(({ column }) => column);

      const locationMap = new Map((locations || []).map((l: any) => [l.name.trim().toLowerCase(), l.id]));
      const shiftMap = new Map<string, string>();
      (shiftTemplates || []).forEach((s: any) => {
        shiftMap.set(s.name.trim().toLowerCase(), s.id);
        if (s.startTime && s.endTime) {
          shiftMap.set(`${s.name.trim()} (${s.startTime}-${s.endTime})`.toLowerCase(), s.id);
        }
      });
      const teacherMap = new Map((staff || []).map((s: any) => [s.fullName.trim().toLowerCase(), s.id]));
      const teacherOptionMap = new Map(buildTeacherRoleOptions(staff, locations)
        .map((option) => [option.label.toLowerCase(), option]));
      const feePackageMap = new Map((feePackages || []).map((pkg: any) => [
        feePackageOptionLabel(pkg).toLowerCase(),
        pkg,
      ]));

      const weekdayMap: Record<string, number> = {
        "t2": 1, "t3": 2, "t4": 3, "t5": 4, "t6": 5, "t7": 6, "cn": 0,
      };

      const parseDateCell = (cell: any): string | undefined => {
        const val = cell.value;
        if (!val) return undefined;
        let y: number, m: number, d: number;
        if (val instanceof Date) {
          y = val.getFullYear(); m = val.getMonth() + 1; d = val.getDate();
        } else {
          const text = cell.text?.toString().trim() || val.toString().trim();
          if (!text) return undefined;
          const parts = text.split("/");
          if (parts.length !== 3) return undefined;
          const [pd, pm, py] = parts.map((p: string) => p.trim());
          if (!pd || !pm || !py) return undefined;
          d = parseInt(pd, 10); m = parseInt(pm, 10); y = parseInt(py, 10);
        }
        const check = new Date(y, m - 1, d);
        if (check.getFullYear() !== y || check.getMonth() + 1 !== m || check.getDate() !== d) {
          return undefined;
        }
        return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      };

      const classGroups = new Map<string, {
        name: string; locationId: string; maxStudents?: number; learningFormat?: string;
        startDate?: string; endDate?: string; endSessions?: number;
        feePackageId?: string; courseId?: string; packageSessions?: number;
        skipHolidays?: boolean;
        teacherRoleIds: Record<string, string>;
        scheduleRows: { weekday: number; shiftId: string; teacherIds: string[]; teacherRoleIds: Record<string, string> }[];
      }>();
      const importIssues: string[] = [];

      worksheet!.eachRow((row: any, rowNum: number) => {
        if (rowNum === 1) return;

        const classCode = row.getCell(1).text?.toString().trim();
        const className = row.getCell(2).text?.toString().trim();
        const locationName = row.getCell(3).text?.toString().trim();
        if (!classCode || !className || !locationName) return;

        const maxStudentsVal = row.getCell(4).value;
        const maxStudents = maxStudentsVal ? Number(maxStudentsVal) : undefined;
        const learningFormatRaw = row.getCell(5).text?.toString().trim().toLowerCase();
        const learningFormat = learningFormatRaw === "online" ? "online" : "offline";
        const weekdayStr = row.getCell(6).text?.toString().trim().toLowerCase();
        const shiftName = row.getCell(7).text?.toString().trim();
        const startDate = parseDateCell(row.getCell(8));
        const endDate = parseDateCell(row.getCell(9));
        const endSessionsText = endSessionsColumn ? row.getCell(endSessionsColumn).text?.toString().trim() : "";
        const endSessions = endSessionsText
          ? Number(row.getCell(endSessionsColumn).value ?? endSessionsText)
          : undefined;
        const feePackageLabel = feePackageColumn ? row.getCell(feePackageColumn).text?.toString().trim() : "";
        const feePackage = feePackageLabel ? feePackageMap.get(feePackageLabel.toLowerCase()) : undefined;
        const skipHolidaysText = skipHolidaysColumn
          ? row.getCell(skipHolidaysColumn).text?.toString().trim().toLowerCase()
          : "";
        const skipHolidays = skipHolidaysText ? ["có", "co", "yes"].includes(skipHolidaysText) : undefined;

        if (endSessionsText && (!Number.isInteger(endSessions) || Number(endSessions) <= 0)) {
          importIssues.push(`Dòng ${rowNum}: Số buổi kết thúc phải là số nguyên dương.`);
        }
        if (skipHolidaysText && !["có", "co", "yes", "không", "khong", "no"].includes(skipHolidaysText)) {
          importIssues.push(`Dòng ${rowNum}: Bỏ qua ngày nghỉ lễ chỉ nhận Có hoặc Không.`);
        }
        if (feePackageLabel && !feePackage) {
          importIssues.push(`Dòng ${rowNum}: Không tìm thấy gói học phí "${feePackageLabel}" trong danh sách hệ thống.`);
        }

        const teacherCells = (teacherColumns.length ? teacherColumns : [10, 11, 12, 13])
          .map((c: number) => row.getCell(c).text?.toString().trim())
          .filter(Boolean);

        const locationId = locationMap.get(locationName.toLowerCase());
        const shiftId = shiftMap.get(shiftName?.toLowerCase());
        const weekday = weekdayMap[weekdayStr];
        const teacherSelections = teacherCells.flatMap((teacherText: string) => {
          const option = teacherOptionMap.get(teacherText.toLowerCase());
          if (option) {
            if (option.locationId && option.locationId !== locationId) {
              importIssues.push(`Dòng ${rowNum}: Vai trò của ${option.fullName} không thuộc cơ sở đã chọn.`);
              return [];
            }
            return [{ teacherId: option.id, roleId: option.roleId }];
          }
          const teacherId = teacherMap.get(teacherText.toLowerCase());
          const member = (staff || []).find((item: any) => item.id === teacherId);
          if (!member) {
            importIssues.push(`Dòng ${rowNum}: Không tìm thấy giáo viên "${teacherText}" trong hệ thống.`);
            return [];
          }
          const roleOptions = getStaffRoleOptions(member, locationId);
          const roleId = resolveTeacherRoleId({}, roleOptions);
          if (roleOptions.length > 1 && !roleId) {
            importIssues.push(`Dòng ${rowNum}: Cần chọn vai trò cho ${member.fullName} trong file mẫu mới.`);
            return [];
          }
          return [{ teacherId, roleId }];
        });
        const teacherIds = teacherSelections.map((selection) => selection.teacherId);
        const teacherRoleIds: Record<string, string> = Object.fromEntries(
          teacherSelections.filter((selection) => selection.roleId).map((selection) => [selection.teacherId, selection.roleId]),
        );

        if (!locationId) return;

        if (!classGroups.has(classCode)) {
          classGroups.set(classCode, {
            name: className, locationId, maxStudents, learningFormat, startDate, endDate,
            endSessions: endSessionsText && Number.isInteger(endSessions) && Number(endSessions) > 0 ? Number(endSessions) : undefined,
            feePackageId: feePackage?.id,
            courseId: feePackage?.courseId,
            packageSessions: feePackage?.sessions ? Number(feePackage.sessions) : undefined,
            skipHolidays,
            teacherRoleIds,
            scheduleRows: [],
          });
        } else {
          const grp = classGroups.get(classCode)!;
          if (!grp.startDate && startDate) grp.startDate = startDate;
          if (!grp.endDate && endDate) grp.endDate = endDate;
          if (skipHolidaysColumn && skipHolidays !== undefined) {
            if (grp.skipHolidays !== undefined && grp.skipHolidays !== skipHolidays) {
              importIssues.push(`Mã lớp ${classCode}: các dòng có lựa chọn bỏ qua ngày nghỉ lễ khác nhau.`);
            } else {
              grp.skipHolidays = skipHolidays;
            }
          }
          for (const [teacherId, roleId] of Object.entries(teacherRoleIds)) {
            if (grp.teacherRoleIds[teacherId] && grp.teacherRoleIds[teacherId] !== roleId) {
              importIssues.push(`Mã lớp ${classCode}: vai trò của cùng một giáo viên không thống nhất giữa các dòng.`);
            } else if (roleId) {
              grp.teacherRoleIds[teacherId] = roleId;
            }
          }
          if (endSessionsText && Number.isInteger(endSessions) && Number(endSessions) > 0) {
            if (grp.endSessions != null && grp.endSessions !== Number(endSessions)) {
              importIssues.push(`Mã lớp ${classCode}: các dòng đang nhập số buổi kết thúc khác nhau.`);
            } else if (grp.endSessions == null) {
              grp.endSessions = Number(endSessions);
            }
          }
          if (feePackage) {
            if (grp.feePackageId && grp.feePackageId !== feePackage.id) {
              importIssues.push(`Mã lớp ${classCode}: các dòng đang chọn nhiều gói học phí khác nhau.`);
            } else if (!grp.feePackageId) {
              grp.feePackageId = feePackage.id;
              grp.courseId = feePackage.courseId;
              grp.packageSessions = feePackage.sessions ? Number(feePackage.sessions) : undefined;
            }
          }
        }

        const grp = classGroups.get(classCode)!;
        if (weekday !== undefined && shiftId) {
          grp.scheduleRows.push({ weekday, shiftId, teacherIds, teacherRoleIds });
        }
      });

      for (const [classCode, grp] of classGroups) {
        if (grp.endDate && grp.endSessions != null) {
          importIssues.push(`Mã lớp ${classCode}: chỉ nhập Ngày kết thúc hoặc Số buổi kết thúc, không nhập cả hai.`);
        }
      }
      if (importIssues.length > 0) {
        setImportStatus("error");
        toast({
          title: "File có thông tin chưa hợp lệ",
          description: importIssues.slice(0, 4).join(" "),
          variant: "destructive",
        });
        return;
      }

      setImportProgress(50);

      const parsedRows: ParsedClassRow[] = [];
      for (const [classCode, grp] of Array.from(classGroups.entries())) {
        const endSessions = grp.endSessions ?? (!grp.endDate ? grp.packageSessions : undefined);
        if (grp.scheduleRows.length === 0) {
          parsedRows.push({
            classCode, className: grp.name, locationId: grp.locationId,
            maxStudents: grp.maxStudents, learningFormat: grp.learningFormat as any,
            startDate: grp.startDate, endDate: grp.endDate, endSessions,
            feePackageId: grp.feePackageId, courseId: grp.courseId,
            skipHolidays: grp.skipHolidays,
          });
        } else {
          for (const sr of grp.scheduleRows) {
            parsedRows.push({
              classCode, className: grp.name, locationId: grp.locationId,
              maxStudents: grp.maxStudents, learningFormat: grp.learningFormat as any,
              startDate: grp.startDate, endDate: grp.endDate, endSessions,
              feePackageId: grp.feePackageId, courseId: grp.courseId,
              skipHolidays: grp.skipHolidays,
              weekday: sr.weekday, shiftId: sr.shiftId, teacherIds: sr.teacherIds,
              teacherRoleIds: { ...grp.teacherRoleIds, ...sr.teacherRoleIds },
            });
          }
        }
      }

      const groups = groupRowsByClassCode(parsedRows);
      const total = groups.size;
      if (total === 0) {
        setImportProgress(100);
        setImportStatus("done");
        toast({ title: "Không có dữ liệu", description: "File không có dòng dữ liệu hợp lệ.", variant: "destructive" });
        return;
      }

      const result = await submitClassGroups(groups, (done) => {
        setImportProgress(50 + Math.round((done / total) * 50));
      });

      setImportProgress(100);
      setImportStatus("done");

      if (result.failed > 0) {
        toast({
          title: "Import hoàn tất",
          description: `Đã tạo ${result.success}/${result.total} lớp học. ${result.failed} lớp bị lỗi.`,
          variant: result.failed === result.total ? "destructive" : "default",
        });
      } else {
        toast({ title: "Thành công", description: `Đã import ${result.success} lớp học thành công.` });
      }
    } catch {
      setImportStatus("error");
      toast({ title: "Lỗi", description: "Không thể đọc file Excel.", variant: "destructive" });
    }
  };

  const downloadSample = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Mau_Lop_Hoc");

      const headers = [
        "Mã lớp học (*)", "Tên lớp (*)", "Cơ sở (*)", "Số học viên tối đa",
        "Hình thức học", "Chu kỳ học", "Ca học", "Ngày bắt đầu", "Ngày kết thúc",
        "Số buổi kết thúc", "Gói học phí", "Bỏ qua ngày nghỉ lễ", "Giáo viên 1", "Giáo viên 2", "Giáo viên 3", "Giáo viên 4",
      ];

      const headerRow = worksheet.addRow(headers);
      headerRow.height = 28;
      headerRow.eachCell((cell: any, colIndex: number) => {
        const isRequired = [1, 2, 3].includes(colIndex);
        cell.font = { bold: true, color: { argb: isRequired ? "FF000000" : "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isRequired ? "FFFFFF00" : "FF4F81BD" } };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
      });

      worksheet.columns = [
        { width: 16 }, { width: 20 }, { width: 18 }, { width: 18 },
        { width: 16 }, { width: 14 }, { width: 18 },
        { width: 15 }, { width: 15 }, { width: 16 }, { width: 38 }, { width: 20 },
        { width: 26 }, { width: 26 }, { width: 26 }, { width: 26 },
      ];

      const cleanName = (name: string) => (name || "").trim();
      const uniqueNames = (values: string[]) => [...new Set(values.map(cleanName).filter(Boolean))];
      const locationNames = uniqueNames((locations || []).map((l: any) => l.name));
      const shiftNames = uniqueNames((shiftTemplates || []).map((s: any) => {
        const time = s.startTime && s.endTime ? ` (${s.startTime}-${s.endTime})` : "";
        return cleanName(`${s.name}${time}`);
      }));
      const teacherNames = uniqueNames(buildTeacherRoleOptions(staff, locations).map((option) => option.label));
      const feePackageLabels = uniqueNames((feePackages || []).map(feePackageOptionLabel));

      const weekdays = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
      if (!locationNames.length || !shiftNames.length || !teacherNames.length) {
        toast({
          title: "Chưa thể tạo file mẫu",
          description: "Không tìm thấy đủ danh sách Cơ sở, Ca học hoặc Giáo viên/Trợ giảng thuộc Phòng Đào tạo. Vui lòng kiểm tra cấu hình hệ thống rồi thử lại.",
          variant: "destructive",
        });
        return;
      }
      const sampleStartDate = new Date(2026, 3, 1);
      const sampleEndDate = new Date(2026, 11, 31);

      const sampleRows = [
        ["A1", "Lớp A1", locationNames[0] || "Cơ sở chính", 20, "Offline", "T2", shiftNames[0] || "Ca 1", sampleStartDate, sampleEndDate, "", feePackageLabels[0] || "", "Không", teacherNames[0] || "", teacherNames[1] || "", "", ""],
        ["A1", "Lớp A1", locationNames[0] || "Cơ sở chính", "", "Offline", "T4", shiftNames[1] || "Ca 2", null, null, "", feePackageLabels[0] || "", "Không", teacherNames[0] || "", "", "", ""],
        ["A2", "Lớp A2", locationNames[0] || "Cơ sở chính", 15, "Online", "T3", shiftNames[0] || "Ca 1", sampleStartDate, null, 20, feePackageLabels[0] || "", "Có", teacherNames[1] || "", "", "", ""],
      ];

      sampleRows.forEach(row => {
        const r = worksheet.addRow(row);
        r.eachCell((cell: any, colNum: number) => {
          cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
          cell.alignment = { vertical: "middle" };
          if ((colNum === 8 || colNum === 9) && cell.value) cell.numFmt = "dd/mm/yyyy";
        });
      });

      const optionsSheet = workbook.addWorksheet("DanhSach");
      optionsSheet.state = "veryHidden";
      const addNamedOptions = (name: string, values: string[], columnNumber: number) => {
        const column = optionsSheet.getColumn(columnNumber);
        values.forEach((value, index) => {
          optionsSheet.getCell(index + 1, columnNumber).value = value;
        });
        const lastRow = Math.max(values.length, 1);
        if (values.length === 0) optionsSheet.getCell(1, columnNumber).value = "";
        workbook.definedNames.add(
          `'DanhSach'!$${column.letter}$1:$${column.letter}$${lastRow}`,
          name,
        );
        return `=${name}`;
      };
      const locationFormula = addNamedOptions("LocationOptions", locationNames, 1);
      const learningFormatFormula = addNamedOptions("LearningFormatOptions", ["Offline", "Online"], 2);
      const weekdayFormula = addNamedOptions("WeekdayOptions", weekdays, 3);
      const shiftFormula = addNamedOptions("ShiftOptions", shiftNames, 4);
      const teacherFormula = addNamedOptions("TeacherOptions", teacherNames, 5);
      const feePackageFormula = addNamedOptions("FeePackageOptions", feePackageLabels, 6);
      const skipHolidaysFormula = addNamedOptions("SkipHolidayOptions", ["Không", "Có"], 7);

      for (let i = 2; i <= 201; i++) {
        worksheet.getCell(`C${i}`).dataValidation = { type: "list", allowBlank: true, formulae: [locationFormula] };
        worksheet.getCell(`E${i}`).dataValidation = { type: "list", allowBlank: true, formulae: [learningFormatFormula] };
        worksheet.getCell(`F${i}`).dataValidation = { type: "list", allowBlank: true, formulae: [weekdayFormula] };
        worksheet.getCell(`G${i}`).dataValidation = { type: "list", allowBlank: true, formulae: [shiftFormula] };
        const hCell = worksheet.getCell(`H${i}`);
        const iCell = worksheet.getCell(`I${i}`);
        const dateValidation = {
          type: "date" as const, allowBlank: true, operator: "greaterThan" as const,
          formulae: [new Date(2000, 0, 1)],
          showErrorMessage: true, errorTitle: "Ngày không hợp lệ",
          error: "Vui lòng chọn ngày từ 01/01/2000 trở đi",
        };
        hCell.numFmt = "dd/mm/yyyy";
        iCell.numFmt = "dd/mm/yyyy";
        hCell.dataValidation = dateValidation;
        iCell.dataValidation = dateValidation;
        worksheet.getCell(`J${i}`).dataValidation = {
          type: "whole", allowBlank: true, operator: "greaterThan", formulae: [0],
          showErrorMessage: true, errorTitle: "Số buổi không hợp lệ",
          error: "Vui lòng nhập số buổi kết thúc là số nguyên dương.",
        };
        worksheet.getCell(`K${i}`).dataValidation = { type: "list", allowBlank: true, formulae: [feePackageFormula] };
        worksheet.getCell(`L${i}`).dataValidation = { type: "list", allowBlank: true, formulae: [skipHolidaysFormula] };
        ["M", "N", "O", "P"].forEach(col => {
          worksheet.getCell(`${col}${i}`).dataValidation = { type: "list", allowBlank: true, formulae: [teacherFormula] };
        });
        worksheet.getCell(`D${i}`).dataValidation = { type: "whole", allowBlank: true, operator: "greaterThan", formulae: [0] };
      }

      const noteSheet = workbook.addWorksheet("Hướng dẫn");
      const notes = [
        ["HƯỚNG DẪN NHẬP LIỆU - FILE MẪU LỚP HỌC"],
        [""],
        ["(*) = Bắt buộc nhập"],
        [""],
        ["MÃ LỚP HỌC: Mã duy nhất của lớp học (vd: A1, IELTS-01)"],
        ["TÊN LỚP: Tên hiển thị của lớp học"],
        ["CƠ SỞ: Chọn từ danh sách cơ sở trong hệ thống"],
        ["SỐ HỌC VIÊN TỐI ĐA: Nhập số nguyên dương"],
        ["HÌNH THỨC HỌC: Chọn Offline hoặc Online"],
        ["CHU KỲ HỌC: Chọn ngày trong tuần (T2-CN)"],
        ["CA HỌC: Chọn từ danh sách ca học trong hệ thống"],
        ["NGÀY BẮT ĐẦU / NGÀY KẾT THÚC: Nhập dạng DD/MM/YYYY (vd: 14/3/2026). Chỉ cần nhập ở dòng đầu tiên của mỗi lớp."],
        ["GIÁO VIÊN 1-4: Chọn từ danh sách giáo viên"],
        ["SỐ BUỔI KẾT THÚC: Nhập số nguyên dương; chỉ dùng thay cho Ngày kết thúc."],
        ["GÓI HỌC PHÍ: Không bắt buộc; chọn theo tên khóa học và tên gói."],
        ["BỎ QUA NGÀY NGHỈ LỄ: Chọn Có để không xếp lịch vào ngày nghỉ đã khai báo; để trống tương đương Không."],
        ["GIÁO VIÊN: Chọn mục có dạng Họ tên — Vai trò (Cơ sở) để import kèm đúng vai trò."],
        [""],
        ["LƯU Ý QUAN TRỌNG:"],
        ["Một lớp có thể học nhiều ngày/tuần với các ca khác nhau."],
        ["Mỗi dòng = 1 chu kỳ học (1 ngày + 1 ca)."],
        ["Các dòng có cùng Mã lớp học sẽ được gộp thành 1 lớp khi import."],
        ["Ngày bắt đầu, Ngày kết thúc, Số buổi kết thúc và Gói học phí: chỉ cần nhập ở một dòng của mỗi lớp."],
        ["Chỉ nhập Ngày kết thúc hoặc Số buổi kết thúc; nếu nhập cả hai, lớp đó sẽ bị báo lỗi."],
        ["Nếu bỏ trống cả Ngày kết thúc và Số buổi kết thúc, hệ thống dùng số buổi của Gói học phí nếu gói có cấu hình."],
        ["Giáo viên nhập ở dòng nào sẽ được gán cho chu kỳ + ca của dòng đó."],
      ];
      notes.forEach((row, idx) => {
        const r = noteSheet.addRow(row);
        if (idx === 0) {
          r.getCell(1).font = { bold: true, size: 13, color: { argb: "FF4F81BD" } };
        } else if (row[0]?.toString().startsWith("LƯU Ý")) {
          r.getCell(1).font = { bold: true, color: { argb: "FFCC0000" } };
        }
      });
      noteSheet.getColumn(1).width = 70;

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "file_mau_lop_hoc.xlsx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast({ title: "Thành công", description: "Đã tải xuống file mẫu Excel lớp học." });
    } catch {
      toast({ title: "Lỗi", description: "Không thể tạo file mẫu.", variant: "destructive" });
    }
  };

  return {
    isImportOpen,
    setIsImportOpen,
    importFile,
    importProgress,
    importStatus,
    handleImportFile,
    handleImportUpload,
    resetImport,
    downloadSample,
  };
}
