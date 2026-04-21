import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface ExcelOptions {
  students: any[];
  staff: any[];
  locations: any[];
  sortedRelationships: any[];
  crmSources: any[];
  crmReasons: any[];
  createStudent: any;
}

export function useExcelImportExport({
  students,
  staff,
  locations,
  sortedRelationships,
  crmSources,
  crmReasons,
  createStudent,
}: ExcelOptions) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isImporting, setIsImporting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const loadExcelJS = async () => {
    if (!(window as any).ExcelJS) {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";
      document.head.appendChild(script);
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
      });
    }
    return (window as any).ExcelJS;
  };

  const exportToExcel = async () => {
    if (!students || students.length === 0) {
      toast({ title: "Thông báo", description: "Không có dữ liệu để xuất." });
      return;
    }

    const headers = [
      "Mã số", "Họ và tên (*)", "Cơ sở", "Phân loại (*)", "SĐT", "Ngày sinh", "Email",
      "PH 1", "SĐT PH 1", "PH 2", "SĐT PH 2", "PH 3", "SĐT PH 3",
      "Mối quan hệ (*)", "Nguồn", "Lý do từ chối", "Sale", "Quản lý", "Giáo viên",
      "Mã lớp", "Tên lớp", "Địa chỉ", "Zalo/FB", "Trình độ", "Ghi chú",
    ];

    try {
      const ExcelJS = await loadExcelJS();
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Danh_Sach_Hoc_Vien");

      const headerRow = worksheet.addRow(headers);
      headerRow.font = { bold: true };

      students.forEach((student) => {
        worksheet.addRow([
          student.code,
          student.fullName,
          student.location?.name || "",
          student.type || "Học viên",
          student.phone || "",
          student.dateOfBirth ? new Date(student.dateOfBirth).toLocaleDateString("vi-VN") : "",
          student.email || "",
          student.parentName || "",
          student.parentPhone || "",
          student.parentName2 || "",
          student.parentPhone2 || "",
          student.parentName3 || "",
          student.parentPhone3 || "",
          Array.isArray(student.pipelineStage) ? student.pipelineStage.join("; ") : (student.pipelineStage || "Lead"),
          student.source || "",
          student.rejectReason || "",
          (student.salesByList || []).map((s: any) => s.fullName).join("; "),
          (student.managedByList || []).map((s: any) => s.fullName).join("; "),
          (student.teacherList || []).map((s: any) => s.fullName).join("; "),
          student.classCode || "",
          student.className || "",
          student.address || "",
          student.socialLink || "",
          student.academicLevel || "",
          student.note || "",
        ]);
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `danh_sach_hoc_vien_${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({ title: "Thành công", description: "Đã tải xuống danh sách học viên." });
    } catch (error) {
      toast({ title: "Lỗi", description: "Không thể xuất dữ liệu. Vui lòng thử lại.", variant: "destructive" });
    }
  };

  const downloadSample = async () => {
    try {
      const ExcelJS = await loadExcelJS();
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Mau_Nhap_Hoc_Vien");

      const headers = [
        "Mã số", "Họ và tên (*)", "Cơ sở", "Phân loại (*)", "SĐT", "Ngày sinh", "Email",
        "PH 1", "SĐT PH 1", "PH 2", "SĐT PH 2", "PH 3", "SĐT PH 3",
        "Mối quan hệ (*)", "Nguồn", "Lý do từ chối", "Sale", "Quản lý", "Giáo viên",
        "Mã lớp", "Tên lớp", "Địa chỉ", "Zalo/FB", "Trình độ", "Ghi chú",
      ];

      const headerRow = worksheet.addRow(headers);
      headerRow.height = 25;

      headerRow.eachCell((cell: any) => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F81BD" } };
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.border = {
          top: { style: "thin" }, left: { style: "thin" },
          bottom: { style: "thin" }, right: { style: "thin" },
        };
      });

      [2, 4, 14].forEach((index) => {
        const cell = headerRow.getCell(index);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
        cell.font = { bold: true, color: { argb: "FF000000" } };
      });

      worksheet.columns = headers.map((h, i) => ({
        header: h, key: h, width: i === 1 ? 30 : 20,
      }));

      const locationNames = locations?.map((l) => l.name) || ["Cơ sở chính"];
      const relNames = sortedRelationships?.map((r) => r.name) || ["Lead", "Học thử"];
      const sourceNames = crmSources?.map((s: any) => s.name) || ["Facebook", "Google"];
      const reasonNames = crmReasons?.map((r: any) => r.reason) || ["Không có nhu cầu"];

      const cleanName = (name: string) => (name ? name.replace(/,/g, " ").trim() : "");

      const saleNames = staff?.filter((s: any) => s.assignments?.some((a: any) =>
        a.role?.name?.toLowerCase().includes("sale") || a.department?.name?.toLowerCase().includes("kinh doanh")
      )).map((s: any) => cleanName(s.fullName)).filter(Boolean) || [];
      const managerNames = staff?.filter((s: any) => s.assignments?.some((a: any) =>
        a.role?.name?.toLowerCase().includes("quản lý") || a.role?.name?.toLowerCase().includes("manager") || a.role?.name?.toLowerCase().includes("tp kinh doanh")
      )).map((s: any) => cleanName(s.fullName)).filter(Boolean) || [];
      const teacherNames = staff?.filter((s: any) => s.assignments?.some((a: any) =>
        a.role?.name?.toLowerCase().includes("giáo viên") || a.role?.name?.toLowerCase().includes("teacher")
      )).map((s: any) => cleanName(s.fullName)).filter(Boolean) || [];

      const allStaffNames = Array.from(new Set(staff?.map((s: any) => cleanName(s.fullName)).filter(Boolean) || []));
      const finalSaleNames = saleNames.length > 0 ? Array.from(new Set(saleNames)) : allStaffNames;
      const finalManagerNames = managerNames.length > 0 ? Array.from(new Set(managerNames)) : allStaffNames;
      const finalTeacherNames = teacherNames.length > 0 ? Array.from(new Set(teacherNames)) : allStaffNames;

      for (let i = 2; i <= 101; i++) {
        worksheet.getCell(`C${i}`).dataValidation = { type: "list", allowBlank: true, formulae: [`"${locationNames.map((n) => n.replace(/,/g, " ")).join(",")}"`] };
        worksheet.getCell(`D${i}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"Học viên,Phụ huynh"'] };
        worksheet.getCell(`N${i}`).dataValidation = { type: "list", allowBlank: true, formulae: [`"${relNames.map((n) => n.replace(/,/g, " ")).join(",")}"`] };
        worksheet.getCell(`O${i}`).dataValidation = { type: "list", allowBlank: true, formulae: [`"${sourceNames.map((n) => n.replace(/,/g, " ")).join(",")}"`] };
        worksheet.getCell(`P${i}`).dataValidation = { type: "list", allowBlank: true, formulae: [`"${reasonNames.map((n) => n.replace(/,/g, " ")).join(",")}"`] };
        if (finalSaleNames.length > 0) worksheet.getCell(`Q${i}`).dataValidation = { type: "list", allowBlank: true, formulae: [`"${finalSaleNames.join(",")}"`] };
        if (finalManagerNames.length > 0) worksheet.getCell(`R${i}`).dataValidation = { type: "list", allowBlank: true, formulae: [`"${finalManagerNames.join(",")}"`] };
        if (finalTeacherNames.length > 0) worksheet.getCell(`S${i}`).dataValidation = { type: "list", allowBlank: true, formulae: [`"${finalTeacherNames.join(",")}"`] };
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "file_mau_nhap_lieu_hoc_vien.xlsx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({ title: "Thành công", description: "Đã tải xuống file mẫu Excel." });
    } catch (error) {
      toast({ title: "Lỗi", description: "Không thể tạo file mẫu. Vui lòng thử lại.", variant: "destructive" });
    }
  };

  const handleImport = async (importFile: File, importLocation: string, onSuccess: () => void) => {
    if (!importFile || !importLocation) {
      toast({ title: "Lỗi", description: "Vui lòng chọn file và cơ sở.", variant: "destructive" });
      return;
    }

    setIsImporting(true);
    setUploadProgress(10);

    try {
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      const arrayBuffer = await importFile.arrayBuffer();
      await workbook.xlsx.load(arrayBuffer);
      const worksheet = workbook.getWorksheet(1);

      if (!worksheet) throw new Error("Không tìm thấy worksheet trong file.");

      const rows: any[][] = [];
      worksheet.eachRow((row) => {
        const values = Array.isArray(row.values) ? row.values : [];
        const rowData = values.slice(1);
        const processedRow = rowData.map((cell) => {
          if (cell && typeof cell === "object") {
            if ("result" in cell) return cell.result;
            if ("richText" in cell) return (cell as any).richText.map((rt: any) => rt.text).join("");
            if ("text" in cell) return (cell as any).text;
          }
          return cell;
        });
        rows.push(processedRow);
      });

      const dataRows = rows.slice(1);
      setUploadProgress(20);

      const classAssignments: { studentId: string; classCode: string; className?: string; locationId: string }[] = [];
      let successCount = 0;
      const errorRows: { row: number; name: string; reason: string }[] = [];

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        if (!row || row.length < 2 || !row[1]) continue;

        const type = row[3] || "Học viên";
        const studentData: any = {
          fullName: String(row[1] || ""),
          type: type === "Phụ huynh" ? "Phụ huynh" : "Học viên",
          locationIds: [importLocation],
          phone: row[4] ? String(row[4]) : undefined,
          email: row[6] ? String(row[6]) : undefined,
          parentName: row[7] ? String(row[7]) : undefined,
          parentPhone: row[8] ? String(row[8]) : undefined,
          parentName2: row[9] ? String(row[9]) : undefined,
          parentPhone2: row[10] ? String(row[10]) : undefined,
          parentName3: row[11] ? String(row[11]) : undefined,
          parentPhone3: row[12] ? String(row[12]) : undefined,
          pipelineStage: row[13] ? [String(row[13])] : ["Lead"],
          relationshipIds: (() => {
            const name = row[13] ? String(row[13]).trim() : "Lead";
            const match = sortedRelationships?.find((r: any) => r.name === name);
            return match ? [match.id] : [];
          })(),
          source: row[14] ? String(row[14]) : undefined,
          rejectReason: row[15] ? String(row[15]) : undefined,
          address: row[21] ? String(row[21]) : undefined,
          socialLink: row[22] ? String(row[22]) : undefined,
          academicLevel: row[23] ? String(row[23]) : undefined,
          note: row[24] ? String(row[24]) : undefined,
          password: "123456",
        };

        const saleNamesRow = row[16] ? String(row[16]).split(";").map((s: string) => s.trim()) : [];
        const managerNamesRow = row[17] ? String(row[17]).split(";").map((s: string) => s.trim()) : [];
        const teacherNamesRow = row[18] ? String(row[18]).split(";").map((s: string) => s.trim()) : [];

        if (saleNamesRow.length > 0) studentData.salesByIds = staff?.filter((s: any) => saleNamesRow.includes(s.fullName)).map((s: any) => s.id);
        if (managerNamesRow.length > 0) studentData.managedByIds = staff?.filter((s: any) => managerNamesRow.includes(s.fullName)).map((s: any) => s.id);
        if (teacherNamesRow.length > 0) studentData.teacherIds = staff?.filter((s: any) => teacherNamesRow.includes(s.fullName)).map((s: any) => s.id);

        if (row[5]) {
          try {
            const dob = new Date(row[5]);
            if (!isNaN(dob.getTime())) studentData.dateOfBirth = dob.toISOString().split("T")[0];
          } catch (e) {}
        }

        // If a code is provided in column A, use it; otherwise leave empty so backend auto-generates
        if (row[0]) {
          const codeStr = String(row[0]).trim();
          studentData.code = codeStr;
          studentData.username = codeStr;
        }
        // (no else — backend will auto-generate a unique code when code is absent)

        const classCode = row[19] ? String(row[19]).trim() : "";
        const className = row[20] ? String(row[20]).trim() : "";

        try {
          const created = await createStudent.mutateAsync(studentData);
          successCount++;
          if (classCode && created?.id) {
            classAssignments.push({
              studentId: created.id,
              classCode,
              className: className || undefined,
              locationId: importLocation,
            });
          }
        } catch (err: any) {
          let reason = err?.message || "Lỗi không xác định";
          try {
            const jsonStart = reason.indexOf("{");
            if (jsonStart !== -1) {
              const parsed = JSON.parse(reason.substring(jsonStart));
              if (parsed?.message) reason = parsed.message;
            }
          } catch (_) {}
          errorRows.push({ row: i + 2, name: studentData.fullName, reason });
        }

        setUploadProgress(Math.round(20 + ((i + 1) / dataRows.length) * 75));
      }

      if (classAssignments.length > 0) {
        setUploadProgress(96);
        try {
          await fetch("/api/students/import-class-assign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(classAssignments),
          });
          await queryClient.invalidateQueries({ queryKey: ["/api/students"] });
        } catch (_) {}
      }

      const classMsg = classAssignments.length > 0
        ? ` Đã thêm ${classAssignments.length} học viên vào lớp.`
        : "";

      if (errorRows.length > 0) {
        const errorSummary = errorRows.slice(0, 3).map(e => `Dòng ${e.row} (${e.name}): ${e.reason}`).join("\n");
        const moreMsg = errorRows.length > 3 ? `\n... và ${errorRows.length - 3} lỗi khác` : "";
        toast({
          title: `Nhập xong: ${successCount} thành công, ${errorRows.length} lỗi`,
          description: errorSummary + moreMsg,
          variant: errorRows.length > 0 && successCount === 0 ? "destructive" : "default",
        });
      } else {
        toast({ title: "Thành công", description: `Đã nhập thành công ${successCount} học viên.${classMsg}` });
      }
      if (successCount > 0) onSuccess();
    } catch (error: any) {
      toast({
        title: "Lỗi nhập dữ liệu",
        description: error.message || "Vui lòng kiểm tra định dạng file Excel (.xlsx).",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
      setUploadProgress(0);
    }
  };

  return { exportToExcel, downloadSample, handleImport, isImporting, uploadProgress };
}
