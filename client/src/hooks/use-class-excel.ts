import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ExcelJS from "exceljs";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface UseClassExcelOptions {
  locations?: any[];
}

export function useClassExcel({ locations }: UseClassExcelOptions) {
  const { toast } = useToast();

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatus, setImportStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");

  const { data: shiftTemplates } = useQuery<any[]>({
    queryKey: ["/api/shift-templates"],
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

      const total = classGroups.size;
      if (total === 0) {
        setImportProgress(100);
        setImportStatus("done");
        toast({ title: "Không có dữ liệu", description: "File không có dòng dữ liệu hợp lệ.", variant: "destructive" });
        return;
      }

      let success = 0;
      let failed = 0;

      for (const [classCode, grp] of classGroups.entries()) {
        try {
          const scheduleByWeekday = new Map<number, string[]>();
          const teacherShiftKeys = new Map<string, string[]>();

          for (const row of grp.scheduleRows) {
            if (!scheduleByWeekday.has(row.weekday)) scheduleByWeekday.set(row.weekday, []);
            scheduleByWeekday.get(row.weekday)!.push(row.shiftId);

            const shiftKey = `${row.weekday}_shift0`;
            for (const id of row.teacherIds) {
              if (!teacherShiftKeys.has(id)) teacherShiftKeys.set(id, []);
              if (!teacherShiftKeys.get(id)!.includes(shiftKey)) {
                teacherShiftKeys.get(id)!.push(shiftKey);
              }
            }
          }

          const totalScheduleRows = grp.scheduleRows.length;
          const schedule_config = Array.from(scheduleByWeekday.entries()).map(([weekday, shiftIds]) => ({
            weekday,
            shifts: [...new Set(shiftIds)].map(id => ({ shift_template_id: id })),
          }));

          const allTeacherIds = Array.from(teacherShiftKeys.keys());
          const teachers_config = allTeacherIds.map(id => {
            const keys = teacherShiftKeys.get(id)!;
            const isAll = keys.length >= totalScheduleRows;
            return { teacher_id: id, mode: isAll ? "all" : "specific", shift_keys: isAll ? [] : keys };
          });

          await apiRequest("POST", "/api/classes", {
            classCode,
            name: grp.name,
            locationId: grp.locationId,
            maxStudents: grp.maxStudents,
            learningFormat: grp.learningFormat,
            startDate: grp.startDate,
            endDate: grp.endDate,
            teacherIds: allTeacherIds,
            weekdays: Array.from(scheduleByWeekday.keys()),
            schedule_config,
            teachers_config,
          });

          success++;
        } catch {
          failed++;
        }

        setImportProgress(50 + Math.round(((success + failed) / total) * 50));
      }

      setImportProgress(100);
      setImportStatus("done");
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });

      if (failed > 0) {
        toast({
          title: "Import hoàn tất",
          description: `Đã tạo ${success}/${total} lớp học. ${failed} lớp bị lỗi.`,
          variant: failed === total ? "destructive" : "default",
        });
      } else {
        toast({ title: "Thành công", description: `Đã import ${success} lớp học thành công.` });
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
