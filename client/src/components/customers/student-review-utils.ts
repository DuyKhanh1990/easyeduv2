export type StudentReviewItemVisibility = {
  inputType: string;
  checked?: boolean;
  comment?: string | null;
};

export function getVisibleStudentReviewItems<T extends StudentReviewItemVisibility>(
  items: readonly T[],
): T[] {
  return items.filter((item) =>
    item.inputType === "checkbox"
      ? item.checked === true
      : Boolean(item.comment?.trim()),
  );
}
