type ScoreSheetItemWithCategory = {
  categoryId?: string | null;
  category?: { id?: string | null } | null;
};

export function orderScoreSheetItemsByCategorySnapshot<T extends ScoreSheetItemWithCategory>(
  items: readonly T[] | null | undefined,
  snapshot: readonly string[] | null | undefined,
): T[] {
  const result = [...(items ?? [])];
  if (!snapshot?.length) return result;

  const positionByCategoryId = new Map<string, number>();
  snapshot.forEach((categoryId, index) => {
    if (!positionByCategoryId.has(categoryId)) positionByCategoryId.set(categoryId, index);
  });

  return result.sort((left, right) => {
    const leftId = left.categoryId ?? left.category?.id ?? null;
    const rightId = right.categoryId ?? right.category?.id ?? null;
    const leftPosition = leftId ? positionByCategoryId.get(leftId) : undefined;
    const rightPosition = rightId ? positionByCategoryId.get(rightId) : undefined;

    if (leftPosition === undefined && rightPosition === undefined) return 0;
    if (leftPosition === undefined) return 1;
    if (rightPosition === undefined) return -1;
    return leftPosition - rightPosition;
  });
}