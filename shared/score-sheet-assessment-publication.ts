const SCORE_SHEET_ASSESSMENT_PUBLICATION_META_KEY = "__scoreSheetPublication";

export function isScoreSheetAssessmentStudentPublished(result: unknown): boolean {
  if (!result || typeof result !== "object" || Array.isArray(result)) return false;

  const metadata = (result as Record<string, unknown>)[SCORE_SHEET_ASSESSMENT_PUBLICATION_META_KEY];
  return !!metadata
    && typeof metadata === "object"
    && !Array.isArray(metadata)
    && (metadata as Record<string, unknown>).publishedToStudent === true;
}

export function withScoreSheetAssessmentStudentPublication(
  result: unknown,
  publishedToStudent: boolean,
): Record<string, unknown> {
  const resultObject = result && typeof result === "object" && !Array.isArray(result)
    ? result as Record<string, unknown>
    : {};
  const existingMetadata = resultObject[SCORE_SHEET_ASSESSMENT_PUBLICATION_META_KEY];
  const metadata = existingMetadata && typeof existingMetadata === "object" && !Array.isArray(existingMetadata)
    ? existingMetadata as Record<string, unknown>
    : {};

  return {
    ...resultObject,
    [SCORE_SHEET_ASSESSMENT_PUBLICATION_META_KEY]: {
      ...metadata,
      publishedToStudent,
    },
  };
}

export function hasScoreSheetAssessmentFeedback(
  notes: Record<string, Record<string, string>>,
  evaluationResponses: Record<string, string | boolean | null>,
): boolean {
  return Object.values(notes).some((sectionNotes) =>
    Object.values(sectionNotes).some((note) => note.trim().length > 0),
  ) || Object.values(evaluationResponses).some((response) =>
    response === true || (typeof response === "string" && response.trim().length > 0),
  );
}

export { SCORE_SHEET_ASSESSMENT_PUBLICATION_META_KEY };
