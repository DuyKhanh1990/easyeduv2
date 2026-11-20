-- Store students intentionally removed from a grade book without deleting their scores/comments.
ALTER TABLE class_grade_books
  ADD COLUMN IF NOT EXISTS excluded_student_ids uuid[] NOT NULL DEFAULT '{}';