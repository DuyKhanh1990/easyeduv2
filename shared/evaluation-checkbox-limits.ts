export interface EvaluationCheckboxGroupRow {
  id: string;
  name: string;
  criteriaId: string;
  parentId?: string | null;
  itemType?: string;
  inputType?: string;
  minChecked?: number | null;
  maxChecked?: number | null;
}

export interface EvaluationCheckboxGroupState {
  teacherId: string;
  teacherName: string;
  groupId: string;
  groupName: string;
  selectedCount: number;
  minChecked: number | null;
  maxChecked: number | null;
  isValid: boolean;
}

export function getEvaluationCheckboxGroupStates(
  reviewData: unknown,
  rows: EvaluationCheckboxGroupRow[],
): EvaluationCheckboxGroupState[] {
  if (!reviewData || typeof reviewData !== "object" || Array.isArray(reviewData)) return [];

  const teacherEntries = Object.entries(reviewData as Record<string, unknown>);
  const groups = rows.filter((row) =>
    row.itemType === "heading" && (row.minChecked != null || row.maxChecked != null),
  );
  const states: EvaluationCheckboxGroupState[] = [];

  for (const [teacherId, rawEntry] of teacherEntries) {
    const entry = rawEntry && typeof rawEntry === "object"
      ? rawEntry as { teacherName?: unknown; items?: unknown }
      : {};
    const items = Array.isArray(entry.items)
      ? entry.items.filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
      : [];

    for (const group of groups) {
      const checkboxIds = new Set(
        rows
          .filter((row) =>
            row.criteriaId === group.criteriaId
            && row.parentId === group.id
            && row.itemType !== "heading"
            && row.inputType === "checkbox",
          )
          .map((row) => row.id),
      );
      if (checkboxIds.size === 0) continue;

      const checkedIds = new Set(
        items
          .filter((item) => item.checked === true && typeof item.subCriteriaId === "string")
          .map((item) => item.subCriteriaId as string)
          .filter((id) => checkboxIds.has(id)),
      );
      const minChecked = group.minChecked ?? null;
      const maxChecked = group.maxChecked ?? null;
      const selectedCount = checkedIds.size;

      states.push({
        teacherId,
        teacherName: typeof entry.teacherName === "string" ? entry.teacherName : teacherId,
        groupId: group.id,
        groupName: group.name,
        selectedCount,
        minChecked,
        maxChecked,
        isValid: (minChecked == null || selectedCount >= minChecked)
          && (maxChecked == null || selectedCount <= maxChecked),
      });
    }
  }

  return states;
}

export function formatEvaluationCheckboxGroupViolation(state: EvaluationCheckboxGroupState): string {
  const requirement = state.minChecked != null && state.maxChecked != null
    ? `từ ${state.minChecked} đến ${state.maxChecked}`
    : state.minChecked != null
      ? `ít nhất ${state.minChecked}`
      : `không quá ${state.maxChecked}`;
  return `Nhóm "${state.groupName}" của ${state.teacherName} cần chọn ${requirement} tickbox (hiện chọn ${state.selectedCount}).`;
}
