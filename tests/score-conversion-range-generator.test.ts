import { describe, expect, it } from "vitest";
import { generateRawScoreRanges } from "../client/src/pages/education/score-conversion/score-conversion-range-generator";

describe("score conversion raw range generation", () => {
  it("generates adjacent, non-overlapping integer ranges for the configured step", () => {
    const result = generateRawScoreRanges(1, 30, 3);

    expect(result).toEqual({
      ok: true,
      ranges: [
        { rawFrom: 27, rawTo: 30 },
        { rawFrom: 23, rawTo: 26 },
        { rawFrom: 19, rawTo: 22 },
        { rawFrom: 15, rawTo: 18 },
        { rawFrom: 11, rawTo: 14 },
        { rawFrom: 7, rawTo: 10 },
        { rawFrom: 3, rawTo: 6 },
        { rawFrom: 1, rawTo: 2 },
      ],
    });
  });

  it("keeps shared boundaries for fractional score ranges", () => {
    const result = generateRawScoreRanges(1, 10, 2.5);

    expect(result).toEqual({
      ok: true,
      ranges: [
        { rawFrom: 7.5, rawTo: 10 },
        { rawFrom: 4, rawTo: 7.5 },
        { rawFrom: 1, rawTo: 4 },
      ],
    });
  });

  it("generates exact-point mappings when the step is zero", () => {
    const result = generateRawScoreRanges(1, 3, 0);

    expect(result).toEqual({
      ok: true,
      ranges: [
        { rawFrom: 3, rawTo: 3 },
        { rawFrom: 2, rawTo: 2 },
        { rawFrom: 1, rawTo: 1 },
      ],
    });
  });
});