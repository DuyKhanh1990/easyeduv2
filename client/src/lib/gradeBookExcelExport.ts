import { orderScoreSheetItemsByCategorySnapshot } from "./score-sheet-order";

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

export type ClassGradeBookExcelExportOptions = {
  classId: string;
  gradeBookId: string;
  scoreSheetId?: string | null;
  locationName?: string | null;
  className?: string | null;
  title: string;
  scoreSheetName?: string | null;
};

type GradeBookDetails = {
  scores?: Array<{
    studentId: string;
    categoryId: string;
    score: string | number | null;
  }>;
  studentComments?: Record<string, string>;
  excludedStudentIds?: string[];
  scoreSheetCategoryOrderSnapshot?: string[] | null;
};

type ClassStudentResponse = {
  id?: string;
  studentId?: string;
  fullName?: string;
  full_name?: string;
  student?: {
    id?: string;
    fullName?: string;
    full_name?: string;
  };
};

type ScoreSheetResponse = {
  id: string;
  name: string;
  items?: Array<{
    category?: GradeBookExcelCategory | null;
  }>;
};

const COMMENT_COLUMN_WIDTH = 42;

export function buildGradeBookExcelRows(input: GradeBookExcelInput): {
  rows: (string | number | null)[][];
  headerRowNumber: number;
} {
  const categoryHeaders = input.categories.map((category) =>
    category.code ? `${category.name} (${category.code})` : category.name);

  return {
    rows: [
      ["Cơ sở", "Lớp", "Tiêu đề", "Bảng điểm"],
      [input.locationName, input.className, input.title, input.scoreSheetName],
      [],
      ["Tên", ...categoryHeaders, "Nhận xét"],
      ...input.students.map((student) => [
        student.name,
        ...input.categories.map((category) => student.scores[category.id] ?? null),
        student.comment,
      ]),
    ],
    headerRowNumber: 4,
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

async function fetchExportJson<T>(url: string, fallbackMessage: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      (payload && typeof payload.message === "string" && payload.message) || fallbackMessage,
    );
  }
  return payload as T;
}

export async function downloadClassGradeBookExcel(
  options: ClassGradeBookExcelExportOptions,
): Promise<void> {
  const [bookDetails, activeStudents, scoreSheets] = await Promise.all([
    fetchExportJson<GradeBookDetails>(
      `/api/classes/${options.classId}/grade-books/${options.gradeBookId}`,
      "Không thể tải dữ liệu bảng điểm.",
    ),
    fetchExportJson<ClassStudentResponse[]>(
      `/api/classes/${options.classId}/active-students`,
      "Không thể tải danh sách học viên.",
    ),
    fetchExportJson<ScoreSheetResponse[]>(
      "/api/score-sheets",
      "Không thể tải cấu hình danh mục điểm.",
    ),
  ]);

  const selectedScoreSheet = scoreSheets.find((sheet) => sheet.id === options.scoreSheetId);
  const categories = orderScoreSheetItemsByCategorySnapshot(
    selectedScoreSheet?.items,
    bookDetails.scoreSheetCategoryOrderSnapshot,
  )
    .flatMap((item) => item.category ? [item.category] : []);
  const excludedIds = new Set(bookDetails.excludedStudentIds ?? []);
  const scoresByStudent = new Map<string, Record<string, string | number | null>>();

  for (const score of bookDetails.scores ?? []) {
    if (!score.studentId || !score.categoryId) continue;
    const values = scoresByStudent.get(score.studentId) ?? {};
    if (score.score === null || score.score === undefined || String(score.score).trim() === "") {
      values[score.categoryId] = null;
    } else {
      const scoreText = String(score.score).trim();
      const numericScore = Number(scoreText);
      values[score.categoryId] = Number.isFinite(numericScore) ? numericScore : scoreText;
    }
    scoresByStudent.set(score.studentId, values);
  }

  const studentComments = bookDetails.studentComments ?? {};
  const gradeBookStudentIds = new Set([
    ...scoresByStudent.keys(),
    ...Object.keys(studentComments),
  ]);
  const exportStudents: GradeBookExcelStudent[] = activeStudents.flatMap((student, index) => {
    const studentId = student.studentId || student.student?.id || student.id;
    if (
      !studentId
      || excludedIds.has(studentId)
      || (gradeBookStudentIds.size > 0 && !gradeBookStudentIds.has(studentId))
    ) {
      return [];
    }

    const name = student.fullName
      || student.full_name
      || student.student?.fullName
      || student.student?.full_name
      || `Học viên ${index + 1}`;
    return [{
      name,
      scores: scoresByStudent.get(studentId) ?? {},
      comment: htmlCommentToPlainText(studentComments[studentId] ?? ""),
    }];
  });

  await downloadGradeBookExcel({
    locationName: options.locationName || "—",
    className: options.className || "—",
    title: options.title,
    scoreSheetName: selectedScoreSheet?.name || options.scoreSheetName || "—",
    categories,
    students: exportStudents,
  });
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
  worksheet.getColumn(input.categories.length + 2).width = COMMENT_COLUMN_WIDTH;

  for (const rowNumber of [1, 2]) {
    const row = worksheet.getRow(rowNumber);
    row.height = 22;
    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle", wrapText: true };
      if (rowNumber === 1) {
        cell.font = { bold: true, color: { argb: "FF334155" } };
      }
    });
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

  input.students.forEach((_, index) => {
    const row = worksheet.getRow(headerRowNumber + index + 1);
    // Leave the height unset so Excel can auto-fit wrapped text instead of saving a fixed tall row.
    row.alignment = { vertical: "top" };
    row.getCell(input.categories.length + 2).alignment = {
      vertical: "top",
      wrapText: true,
    };
  });

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