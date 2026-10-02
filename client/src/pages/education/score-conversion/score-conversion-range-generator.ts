export type GeneratedRawScoreRange = {
  rawFrom: number;
  rawTo: number;
};

export type RawScoreRangeGenerationResult =
  | { ok: true; ranges: GeneratedRawScoreRange[] }
  | { ok: false; reason: "invalid-range" | "fractional-zero-step" | "too-many" | "no-progress" };

const MAX_GENERATED_RANGES = 500;

export function generateRawScoreRanges(
  rawMinScore: number,
  rawMaxScore: number,
  rawStep: number,
): RawScoreRangeGenerationResult {
  if (
    !Number.isFinite(rawMinScore) ||
    !Number.isFinite(rawMaxScore) ||
    !Number.isFinite(rawStep) ||
    rawMaxScore < rawMinScore ||
    rawStep < 0
  ) {
    return { ok: false, reason: "invalid-range" };
  }
  if (rawStep === 0 && (!Number.isInteger(rawMinScore) || !Number.isInteger(rawMaxScore))) {
    return { ok: false, reason: "fractional-zero-step" };
  }

  const integerScoreBands =
    Number.isInteger(rawMinScore) &&
    Number.isInteger(rawMaxScore) &&
    Number.isInteger(rawStep);
  const ranges: GeneratedRawScoreRange[] = [];
  let upper = rawMaxScore;
  let lower = rawStep === 0 ? upper : Math.max(rawMinScore, upper - rawStep);

  while (true) {
    if (ranges.length >= MAX_GENERATED_RANGES) {
      return { ok: false, reason: "too-many" };
    }

    ranges.push({ rawFrom: lower, rawTo: upper });
    if (lower <= rawMinScore) break;

    const nextUpper = rawStep === 0
      ? lower - 1
      : integerScoreBands
        ? lower - 1
        : lower;
    const nextLower = rawStep === 0
      ? Math.max(rawMinScore, nextUpper)
      : Math.max(rawMinScore, nextUpper - rawStep - (integerScoreBands ? 0 : 1));
    if (nextLower >= lower) {
      return { ok: false, reason: "no-progress" };
    }

    upper = nextUpper;
    lower = nextLower;
  }

  return { ok: true, ranges };
}