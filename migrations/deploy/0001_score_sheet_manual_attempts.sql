-- Manual score-sheet attempts have no class session; regular session attempts remain linked.
ALTER TABLE public.score_sheet_assessment_student_attempts
  ALTER COLUMN class_session_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS score_sheet_assessment_manual_attempts_unique_idx
  ON public.score_sheet_assessment_student_attempts (assessment_id, student_id, attempt_number)
  WHERE class_session_id IS NULL;
