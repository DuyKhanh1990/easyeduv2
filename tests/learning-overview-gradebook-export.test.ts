import { describe, expect, it } from "vitest";
import {
  buildGradeBookExcelRows,
  estimateCommentRowHeight,
} from "../client/src/pages/education/learning-overview/gradeBookExcelExport";

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

    expect(result.headerRowNumber).toBe(4);
    expect(result.rows.slice(0, 2)).toEqual([
      ["Cơ sở", "Lớp", "Tiêu đề", "Bảng điểm"],
      ["Cơ sở chính", "IELTS 6.0", "Giữa khóa", "Bảng điểm IELTS"],
    ]);
    expect(result.rows[3]).toEqual(["Tên", "Nghe (L)", "Viết", "Nhận xét"]);
    expect(result.rows[4]).toEqual(["Nguyễn An", 8.5, null, "Tiến bộ tốt"]);
  });

  it("increases the worksheet row height to fit longer comments", () => {
    const shortComment = "Học viên tiến bộ tốt trong khóa học.";
    const longerComment = Array(6).fill(shortComment).join(" ");

    expect(estimateCommentRowHeight(longerComment))
      .toBeGreaterThan(estimateCommentRowHeight(shortComment));
  });
});