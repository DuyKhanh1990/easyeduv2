-- Store the reason entered when a student leave request is rejected.
ALTER TABLE student_leave_requests
  ADD COLUMN IF NOT EXISTS rejection_reason text;