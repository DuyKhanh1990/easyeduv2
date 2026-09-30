import { describe, expect, it } from "vitest";
import { buildGradeBookExcelRows } from "../client/src/pages/education/learning-overview/gradeBookExcelExport";

describe("learning overview grade book export", () => {
  it("places the requested metadata above dynamic score-category columns and student comments", () => {
    const result = buildGradeBookExcelRows({
      locationName: "Cơ sở chính",
      className: "IELTS 6.0",
      title: "Giữa khóa",
      scoreSheetName: "Bảng điểm IELTS",
      categories: [
        { id: "listening", name: "Nghe", code: "L" },
        { id: "writing", name: "Viết" },
      ],
      students: [{
        name: "Nguyễn An",
        scores: { listening: 8.5, writing: null },
        comment: "Tiến bộ tốt",
      }],
    });

    expect(result.headerRowNumber).toBe(6);
    expect(result.rows.slice(0, 4)).toEqual([
      ["Cơ sở", "Cơ sở chính"],
      ["Lớp", "IELTS 6.0"],
      ["Tiêu đề", "Giữa khóa"],
      ["Bảng điểm", "Bảng điểm IELTS"],
    ]);
    expect(result.rows[5]).toEqual(["Tên", "Nghe (L)", "Viết", "Nhận xét"]);
    expect(result.rows[6]).toEqual(["Nguyễn An", 8.5, null, "Tiến bộ tốt"]);
  });
});