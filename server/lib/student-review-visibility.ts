export type StudentReviewVisibilityItem = {
  comment?: string | null;
  inputType?: string;
  checked?: boolean;
};

export function hasVisibleStudentReview(
  items: readonly StudentReviewVisibilityItem[],
  overallRating: number | null | undefined,
): boolean {
  const hasVisibleItem = items.some((item) =>
    Boolean(item.comment?.trim()) ||
    (item.inputType === "checkbox" && item.checked === true),
  );

  return hasVisibleItem || (overallRating != null && Number.isFinite(overallRating) && overallRating > 0);
}
