import { describe, expect, it } from "vitest";
import { orderScoreSheetItemsByCategorySnapshot } from "../client/src/lib/score-sheet-order";

describe("orderScoreSheetItemsByCategorySnapshot", () => {
  it("keeps the saved order and places categories added later after it", () => {
    const items = [
      { categoryId: "new", label: "New" },
      { categoryId: "second", label: "Second" },
      { categoryId: "first", label: "First" },
    ];

    expect(orderScoreSheetItemsByCategorySnapshot(items, ["first", "second"])).toEqual([
      items[2],
      items[1],
      items[0],
    ]);
  });

  it("keeps the current order when a gradebook has no snapshot", () => {
    const items = [{ categoryId: "b" }, { categoryId: "a" }];

    expect(orderScoreSheetItemsByCategorySnapshot(items, null)).toEqual(items);
  });
});