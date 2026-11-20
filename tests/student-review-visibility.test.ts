import { describe, expect, it } from "vitest";
import { hasVisibleStudentReview } from "../server/lib/student-review-visibility";

describe("customer session review visibility", () => {
  it("keeps a published review that only has a checked checkbox criterion", () => {
    expect(
      hasVisibleStudentReview(
        [{ inputType: "checkbox", checked: true, comment: "" }],
        null,
      ),
    ).toBe(true);
  });

  it("does not treat an unchecked checkbox as review content by itself", () => {
    expect(
      hasVisibleStudentReview(
        [{ inputType: "checkbox", checked: false, comment: "" }],
        null,
      ),
    ).toBe(false);
  });

  it("keeps reviews with text or a positive rating", () => {
    expect(hasVisibleStudentReview([{ comment: "Good progress" }], null)).toBe(true);
    expect(hasVisibleStudentReview([], 4)).toBe(true);
  });

  it("filters out reviews with no entered feedback", () => {
    expect(hasVisibleStudentReview([{ comment: "   " }], 0)).toBe(false);
  });
});
