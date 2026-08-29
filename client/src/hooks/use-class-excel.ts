import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ExcelJS from "exceljs";
import { useToast } from "@/hooks/use-toast";
import { groupRowsByClassCode, submitClassGroups, type ParsedClassRow } from "@/hooks/use-class-bulk-submit";

interface UseClassExcelOptions {
  locations?: any[];
}

const WEEKDAY_MAP: Record<number, string> = { 1: "T2", 2: "T3", 3: "T4", 4: "T5", 5: "T6", 6: "T7", 0: "CN" };
const TYPE_LABEL: Record<string, string> = { group: "Nhóm", tutor: "Cá nhân 1-1" };

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

      const locationMap = new Map((locations || []).map((l: any) => [l.name.trim().toLowerCase(), l.id]));
      const shiftMap = new Map<string, string>();
      (shiftTemplates || []).forEach((s: any) => {
        shiftMap.set(s.name.trim().toLowerCase(), s.id);
        if (s.startTime && s.endTime) {
          shiftMap.set(`${s.name.trim()} (${s.startTime}-${s.endTime})`.toLowerCase(), s.id);
        }
      });
      const teacherMap = new Map((staff || []).map((s: any) => [s.fullName.trim().toLowerCase(), s.id]));

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
        startDate?: string; endDate?: string;
        scheduleRows: { weekday: number; shiftId: string; teacherIds: string[] }[];
      }>();

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

        const teacherCells = [10, 11, 12, 13]
          .map((c: number) => row.getCell(c).text?.toString().trim())
          .filter(Boolean);

        const locationId = locationMap.get(locationName.toLowerCase());
        const shiftId = shiftMap.get(shiftName?.toLowerCase());
        const weekday = weekdayMap[weekdayStr];
        const teacherIds = teacherCells
          .map((t: string) => teacherMap.get(t.toLowerCase()))
          .filter(Boolean) as string[];

        if (!locationId) return;

        if (!classGroups.has(classCode)) {
          classGroups.set(classCode, { name: className, locationId, maxStudents, learningFormat, startDate, endDate, scheduleRows: [] });
        } else {
          const grp = classGroups.get(classCode)!;
          if (!grp.startDate && startDate) grp.startDate = startDate;
          if (!grp.endDate && endDate) grp.endDate = endDate;
        }

        const grp = classGroups.get(classCode)!;
        if (weekday !== undefined && shiftId) {
          grp.scheduleRows.push({ weekday, shiftId, teacherIds });
        }
      });

      setImportProgress(50);

      const parsedRows: ParsedClassRow[] = [];
      for (const [classCode, grp] of Array.from(classGroups.entries())) {
        if (grp.scheduleRows.length === 0) {
          parsedRows.push({
            classCode, className: grp.name, locationId: grp.locationId,
            maxStudents: grp.maxStudents, learningFormat: grp.learningFormat as any,
            startDate: grp.startDate, endDate: grp.endDate,
          });
        } else {
          for (const sr of grp.scheduleRows) {
            parsedRows.push({
              classCode, className: grp.name, locationId: grp.locationId,
              maxStudents: grp.maxStudents, learningFormat: grp.learningFormat as any,
              startDate: grp.startDate, endDate: grp.endDate,
              weekday: sr.weekday, shiftId: sr.shiftId, teacherIds: sr.teacherIds,
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
        "Giáo viên 1", "Giáo viên 2", "Giáo viên 3", "Giáo viên 4",
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
        { width: 15 }, { width: 15 },
        { width: 20 }, { width: 20 }, { width: 20 }, { width: 20 },
      ];

      const cleanName = (name: string) => (name || "").replace(/,/g, " ").trim();
      const locationNames = (locations || []).map((l: any) => cleanName(l.name)).filter(Boolean);
      const shiftNames = (shiftTemplates || []).map((s: any) => {
        const time = s.startTime && s.endTime ? ` (${s.startTime}-${s.endTime})` : "";
        return cleanName(`${s.name}${time}`);
      }).filter(Boolean);
      const teacherNames = (staff || []).map((s: any) => cleanName(s.fullName)).filter(Boolean);

      const weekdays = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
      const sampleStartDate = new Date(2026, 3, 1);
      const sampleEndDate = new Date(2026, 11, 31);

      const sampleRows = [
        ["A1", "Lớp A1", locationNames[0] || "Cơ sở chính", 20, "Offline", "T2", shiftNames[0] || "Ca 1", sampleStartDate, sampleEndDate, teacherNames[0] || "", teacherNames[1] || "", "", ""],
        ["A1", "Lớp A1", locationNames[0] || "Cơ sở chính", "", "Offline", "T4", shiftNames[1] || "Ca 2", null, null, teacherNames[0] || "", "", "", ""],
        ["A2", "Lớp A2", locationNames[0] || "Cơ sở chính", 15, "Online", "T3", shiftNames[0] || "Ca 1", sampleStartDate, sampleEndDate, teacherNames[1] || "", "", "", ""],
      ];

      sampleRows.forEach(row => {
        const r = worksheet.addRow(row);
        r.eachCell((cell: any, colNum: number) => {
          cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
          cell.alignment = { vertical: "middle" };
          if ((colNum === 8 || colNum === 9) && cell.value) cell.numFmt = "dd/mm/yyyy";
        });
      });

      for (let i = 2; i <= 201; i++) {
        if (locationNames.length > 0) {
          worksheet.getCell(`C${i}`).dataValidation = { type: "list", allowBlank: true, formulae: [`"${locationNames.join(",")}"`] };
        }
        worksheet.getCell(`E${i}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"Offline,Online"'] };
        worksheet.getCell(`F${i}`).dataValidation = { type: "list", allowBlank: true, formulae: [`"${weekdays.join(",")}"`] };
        if (shiftNames.length > 0) {
          worksheet.getCell(`G${i}`).dataValidation = { type: "list", allowBlank: true, formulae: [`"${shiftNames.join(",")}"`] };
        }
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
        if (teacherNames.length > 0) {
          const formula = `"${teacherNames.join(",")}"`;
          ["J", "K", "L", "M"].forEach(col => {
            worksheet.getCell(`${col}${i}`).dataValidation = { type: "list", allowBlank: true, formulae: [formula] };
          });
        }
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
        [""],
        ["LƯU Ý QUAN TRỌNG:"],
        ["Một lớp có thể học nhiều ngày/tuần với các ca khác nhau."],
        ["Mỗi dòng = 1 chu kỳ học (1 ngày + 1 ca)."],
        ["Các dòng có cùng Mã lớp học sẽ được gộp thành 1 lớp khi import."],
        ["Ngày bắt đầu và kết thúc: nhập ở dòng đầu tiên của mỗi lớp, các dòng còn lại có thể bỏ trống."],
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
