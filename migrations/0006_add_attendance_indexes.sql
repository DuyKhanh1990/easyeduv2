-- Add performance indexes for attendance page
CREATE INDEX IF NOT EXISTS idx_student_sessions_session
ON student_sessions(class_session_id);

CREATE INDEX IF NOT EXISTS idx_class_sessions_date
ON class_sessions(session_date);

CREATE INDEX IF NOT EXISTS idx_student_sessions_student
ON student_sessions(student_id);

-- Additional useful indexes for filtering
CREATE INDEX IF NOT EXISTS idx_class_sessions_class
ON class_sessions(class_id);

CREATE INDEX IF NOT EXISTS idx_student_sessions_class
ON student_sessions(class_id);
