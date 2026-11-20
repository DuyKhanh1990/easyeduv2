export function getConversionScoreSheetFilterId(assessment: {
  assessmentId: string;
  scoreSheetTemplateId?: string | null;
}) {
  return `conversion:${assessment.scoreSheetTemplateId ?? assessment.assessmentId}`;
}
