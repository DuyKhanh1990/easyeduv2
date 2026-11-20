-- Add unique constraint on (class_session_id, staff_id) so ON CONFLICT upsert works correctly.
-- Without this, every PUT /api/learning-overview/teacher-attendance call throws a PostgreSQL error
-- and teacher check-in/check-out times are never actually saved to the database.
ALTER TABLE teacher_attendance
  ADD CONSTRAINT teacher_attendance_session_staff_unique
  UNIQUE (class_session_id, staff_id);
