import { describe, expect, it } from "vitest";
import { isCurriculumContentType } from "../shared/my-space-calendar-content";

describe("isCurriculumContentType", () => {
  it.each(["Giáo trình", "curriculum", " Curriculum "])("recognizes curriculum type %s", (contentType) => {
    expect(isCurriculumContentType(contentType)).toBe(true);
  });

  it("leaves other content types and non-string values unchanged", () => {
    expect(isCurriculumContentType("Bài tập về nhà")).toBe(false);
    expect(isCurriculumContentType(null)).toBe(false);
  });
});
