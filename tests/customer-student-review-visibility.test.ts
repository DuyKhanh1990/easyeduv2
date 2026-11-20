import { describe, expect, it } from "vitest";
import { getVisibleStudentReviewItems } from "../client/src/components/customers/student-review-utils";

describe("customer student review item visibility", () => {
  it("shows checked checkbox criteria and text criteria with content only", () => {
    const checked = { inputType: "checkbox", checked: true, comment: "" };
    const unchecked = { inputType: "checkbox", checked: false, comment: "" };
    const written = { inputType: "text", comment: "Good progress" };
    const empty = { inputType: "text", comment: "  " };

    expect(getVisibleStudentReviewItems([checked, unchecked, written, empty])).toEqual([
      checked,
      written,
    ]);
  });
});
