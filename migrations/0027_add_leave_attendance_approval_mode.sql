-- Track whether approving a leave request changed attendance statuses.
-- Existing approved requests were created by the previous approval flow,
-- which always applied a selected attendance status.
ALTER TABLE student_leave_requests
  ADD COLUMN IF NOT EXISTS attendance_approval_mode varchar(20);

UPDATE student_leave_requests
SET attendance_approval_mode = 'applied'
WHERE status = 'approved'
  AND attendance_approval_mode IS NULL;