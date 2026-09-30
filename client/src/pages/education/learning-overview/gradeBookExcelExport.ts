export type GradeBookExcelCategory = {
  id: string;
  name: string;
  code?: string | null;
};

export type GradeBookExcelStudent = {
  name: string;
  scores: Record<string, string | number | null>;
  comment: string;
};

export type GradeBookExcelInput = {
  locationName: string;
  className: string;
  title: string;
  scoreSheetName: string;
  categories: GradeBookExcelCategory[];
  students: GradeBookExcelStudent[];
};

export function buildGradeBookExcelRows(input: GradeBookExcelInput): {
  rows: (string | number | null)[][];
  headerRowNumber: number;
} {
  const categoryHeaders = input.categories.map((category) =>
    category.code ? `${category.name} (${category.code})` : category.name);

  return {
    rows: [
      ["Cơ sở", input.locationName],
      ["Lớp", input.className],
      ["Tiêu đề", input.title],
      ["Bảng điểm", input.scoreSheetName],
      [],
      ["Tên", ...categoryHeaders, "Nhận xét"],
      ...input.students.map((student) => [
        student.name,
        ...input.categories.map((category) => student.scores[category.id] ?? null),
        student.comment,
      ]),
    ],
    headerRowNumber: 6,
  };
}

export function htmlCommentToPlainText(html: string): string {
  if (!html.trim()) return "";

  const parser = new DOMParser();
  let parsed = parser.parseFromString(html, "text/html");
  const decodedText = parsed.body.textContent ?? "";
  // Some saved rich-text comments contain escaped markup rather than live tags.
  if (
    parsed.body.childElementCount === 0
    && /<\/?[a-z][^>]*>/i.test(decodedText)
  ) {
    parsed = parser.parseFromString(decodedText, "text/html");
  }
  parsed.querySelectorAll("script, style").forEach((element) => element.remove());

  const blockTags = new Set([
    "P", "DIV", "LI", "BLOCKQUOTE", "H1", "H2", "H3", "H4", "H5", "H6",
  ]);
  const readNode = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const element = node as HTMLElement;
    if (element.tagName === "BR") return "\n";
    if (element.tagName === "SCRIPT" || element.tagName === "STYLE") return "";

    const content = Array.from(element.childNodes).map(readNode).join("");
    if (element.tagName === "LI") return `• ${content}\n`;
    return blockTags.has(element.tagName) ? `${content}\n` : content;
  };

  return readNode(parsed.body)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function downloadGradeBookExcel(input: GradeBookExcelInput): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "EduManage";
  workbook.subject = input.title;

  const worksheet = workbook.addWorksheet("Bảng điểm");
  const { rows, headerRowNumber } = buildGradeBookExcelRows(input);
  rows.forEach((row) => worksheet.addRow(row));

  worksheet.getColumn(1).width = 30;
  input.categories.forEach((_, index) => {
    worksheet.getColumn(index + 2).width = 18;
  });
  worksheet.getColumn(input.categories.length + 2).width = 52;

  for (let rowNumber = 1; rowNumber <= 4; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    row.height = 22;
    row.getCell(1).font = { bold: true, color: { argb: "FF334155" } };
    row.getCell(2).alignment = { vertical: "middle", wrapText: true };
  }

  const headerRow = worksheet.getRow(headerRowNumber);
  headerRow.height = 32;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FF1E293B" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEFF6FF" },
    };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } };
  });

  for (let rowNumber = headerRowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    row.alignment = { vertical: "top" };
    row.getCell(input.categories.length + 2).alignment = {
      vertical: "top",
      wrapText: true,
    };
  }

  worksheet.views = [{ state: "frozen", ySplit: headerRowNumber }];
  worksheet.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: {
      row: Math.max(headerRowNumber, worksheet.rowCount),
      column: input.categories.length + 2,
    },
  };
  worksheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };

  const filePart = input.title
    .normalize("NFC")
    .replace(/[<>:"/\\|?*]/g, "-")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 80) || "bang_diem";
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `bang_diem_${filePart}.xlsx`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}