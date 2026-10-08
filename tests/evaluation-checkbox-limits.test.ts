import { describe, expect, it } from "vitest";
import {
  getEvaluationCheckboxGroupStates,
  type EvaluationCheckboxGroupRow,
} from "@shared/evaluation-checkbox-limits";

const baseRows: EvaluationCheckboxGroupRow[] = [
  {
    id: "group-1",
    name: "Kết quả học tập",
    criteriaId: "criteria-1",
    parentId: null,
    itemType: "heading",
    inputType: "text",
    minChecked: 1,
    maxChecked: 3,
  },
  ...["a", "b", "c", "d"].map((id) => ({
    id,
    name: `Checkbox ${id}`,
    criteriaId: "criteria-1",
    parentId: "group-1",
    itemType: "criterion",
    inputType: "checkbox",
  })),
  {
    id: "text-child",
    name: "Nhận xét",
    criteriaId: "criteria-1",
    parentId: "group-1",
    itemType: "criterion",
    inputType: "text",
  },
];

function makeReview(checkedIds: string[]) {
  return {
    teacher: {
      teacherName: "Giáo viên",
      items: checkedIds.map((subCriteriaId) => ({ subCriteriaId, checked: true })),
    },
  };
}

describe("evaluation checkbox group limits", () => {
  it("requires the configured minimum", () => {
    const [state] = getEvaluationCheckboxGroupStates(makeReview([]), baseRows);
    expect(state).toMatchObject({ selectedCount: 0, minChecked: 1, maxChecked: 3, isValid: false });
  });

  it("enforces a maximum without requiring a minimum", () => {
    const rows = baseRows.map((row) => row.id === "group-1"
      ? { ...row, minChecked: null, maxChecked: 2 }
      : row);
    const [state] = getEvaluationCheckboxGroupStates(makeReview(["a", "b", "c"]), rows);
    expect(state).toMatchObject({ selectedCount: 3, minChecked: null, maxChecked: 2, isValid: false });
  });

  it("accepts counts at either inclusive endpoint of a configured range", () => {
    const atMinimum = getEvaluationCheckboxGroupStates(makeReview(["a"]), baseRows)[0];
    const atMaximum = getEvaluationCheckboxGroupStates(makeReview(["a", "b", "c"]), baseRows)[0];
    expect(atMinimum.isValid).toBe(true);
    expect(atMaximum.isValid).toBe(true);
  });

  it("counts only checked checkbox children in the matching group", () => {
    const state = getEvaluationCheckboxGroupStates(
      { teacher: { items: [
        { subCriteriaId: "a", checked: true },
        { subCriteriaId: "b", checked: false },
        { subCriteriaId: "text-child", checked: true },
        { subCriteriaId: "other-group", checked: true },
      ] } },
      baseRows,
    )[0];
    expect(state.selectedCount).toBe(1);
    expect(state.isValid).toBe(true);
  });

  it("leaves a group unrestricted when both bounds are empty", () => {
    const rows = baseRows.map((row) => row.id === "group-1"
      ? { ...row, minChecked: null, maxChecked: null }
      : row);
    expect(getEvaluationCheckboxGroupStates(makeReview([]), rows)).toEqual([]);
  });
});
